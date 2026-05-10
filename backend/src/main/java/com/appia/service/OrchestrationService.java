package com.appia.service;

import com.appia.model.*;
import com.appia.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Appia — Core Orchestration Service
 * The "Heart" of the Roman Stack — manages all placement decisions,
 * SLA monitoring, and VNF/SFC lifecycle.
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class OrchestrationService {

    private final NetworkNodeRepository     nodeRepo;
    private final ServiceFunctionChainRepository sfcRepo;
    private final PlacementRecordRepository placementRepo;
    private final GeminiOrchestratorService geminiAdvisor;

    // ── Node Operations ───────────────────────────────────────────────────────

    public List<NetworkNode> getAllNodes() {
        return nodeRepo.findAll();
    }

    public Optional<NetworkNode> getNode(String nodeId) {
        return nodeRepo.findById(nodeId);
    }

    public NetworkNode saveNode(NetworkNode node) {
        return nodeRepo.save(node);
    }

    public List<NetworkNode> getGreenNodes(double carbonThreshold) {
        return nodeRepo.findGreenNodes(carbonThreshold);
    }

    /**
     * Update node telemetry from Python simulation or real data source.
     * Called every simulation tick / real telemetry push.
     */
    public NetworkNode updateNodeTelemetry(String nodeId, double carbon, double cost,
                                           double batteryPct, double cpuLoad, double memLoad) {
        return nodeRepo.findById(nodeId).map(node -> {
            node.setCarbonIntensityGco2Kwh(carbon);
            node.setEnergyCostEurKwh(cost);
            node.setBatteryLevelPct(batteryPct);
            node.setCpuLoadPct(cpuLoad);
            node.setMemoryLoadPct(memLoad);
            return nodeRepo.save(node);
        }).orElseThrow(() -> new RuntimeException("Node not found: " + nodeId));
    }

    // ── SFC Operations ────────────────────────────────────────────────────────

    public List<ServiceFunctionChain> getAllSfcs() {
        return sfcRepo.findAll();
    }

    public List<ServiceFunctionChain> getSlaViolators() {
        return sfcRepo.findSlaViolators();
    }

    public List<ServiceFunctionChain> getCriticalNotRunning() {
        return sfcRepo.findCriticalNotRunning();
    }

    // ── Placement Logic ───────────────────────────────────────────────────────

    /**
     * Place a single SFC on the specified node.
     * Records the placement and optionally gets a Gemini explanation.
     */
    public PlacementRecord placeSfc(String sfcId, String nodeId,
                                    PlacementRecord.DecisionMaker decisionMaker,
                                    double rewardSignal) {
        ServiceFunctionChain sfc  = sfcRepo.findBySfcId(sfcId)
            .orElseThrow(() -> new RuntimeException("SFC not found: " + sfcId));
        NetworkNode node = nodeRepo.findById(nodeId)
            .orElseThrow(() -> new RuntimeException("Node not found: " + nodeId));

        // Validate capacity
        if (!node.canHost(sfc.getCpuRequiredCores(), sfc.getMemoryRequiredGb(), sfc.getBandwidthRequiredGbps())) {
            log.warn("Node {} cannot host SFC {} — insufficient capacity", nodeId, sfcId);
        }

        // Update SFC
        sfc.setAssignedNode(node);
        sfc.setStatus(ServiceFunctionChain.SfcStatus.RUNNING);
        sfc.setCurrentLatencyMs(node.getProcessingLatencyMs());
        if (sfc.isSlaViolated()) {
            sfc.setSlaViolationCount(sfc.getSlaViolationCount() + 1);
        }
        sfcRepo.save(sfc);

        // Get Gemini explanation (async-safe — falls back gracefully if API is down)
        String explanation = null;
        if (decisionMaker == PlacementRecord.DecisionMaker.PPO_AGENT) {
            try {
                explanation = geminiAdvisor.explainPlacement(sfc, node, nodeRepo.findAll(), rewardSignal);
            } catch (Exception e) {
                log.debug("Gemini explanation skipped: {}", e.getMessage());
            }
        }

        // Record
        PlacementRecord record = PlacementRecord.builder()
            .sfcId(sfcId)
            .nodeId(nodeId)
            .sfcPriority(sfc.getPriority())
            .decision(PlacementRecord.PlacementDecision.PLACED)
            .carbonIntensityAtPlacement(node.getCarbonIntensityGco2Kwh())
            .energyCostAtPlacement(node.getEnergyCostEurKwh())
            .batteryLevelAtPlacement(node.getBatteryLevelPct())
            .nodeLoadAtPlacement(node.getCpuLoadPct())
            .achievedLatencyMs(sfc.getCurrentLatencyMs())
            .slaWasMet(!sfc.isSlaViolated())
            .rewardSignal(rewardSignal)
            .decisionMaker(decisionMaker)
            .aiExplanation(explanation)
            .build();

        return placementRepo.save(record);
    }

    /**
     * Shed a LOW priority SFC to free resources / save energy.
     * CRITICAL SFCs cannot be shed — this method enforces that rule.
     */
    public void shedSfc(String sfcId) {
        ServiceFunctionChain sfc = sfcRepo.findBySfcId(sfcId)
            .orElseThrow(() -> new RuntimeException("SFC not found: " + sfcId));

        if (!sfc.canBeShed()) {
            throw new IllegalStateException("Cannot shed " + sfc.getPriority() + " priority SFC: " + sfcId);
        }

        sfc.setStatus(ServiceFunctionChain.SfcStatus.SHED);
        sfc.setAssignedNode(null);
        sfcRepo.save(sfc);

        placementRepo.save(PlacementRecord.builder()
            .sfcId(sfcId).nodeId("SHED")
            .sfcPriority(sfc.getPriority())
            .decision(PlacementRecord.PlacementDecision.SHED)
            .slaWasMet(true)   // Shedding LOW is acceptable
            .rewardSignal(0.0)
            .decisionMaker(PlacementRecord.DecisionMaker.PPO_AGENT)
            .build());

        log.info("SFC {} shed to save energy", sfcId);
    }

    /**
     * Find the greenest node that can host an SFC.
     * Used by the Greedy Energy baseline agent.
     */
    public Optional<NetworkNode> findGreenestCapableNode(ServiceFunctionChain sfc) {
        return nodeRepo.findCapableNodes(sfc.getCpuRequiredCores(), sfc.getMemoryRequiredGb())
            .stream()
            .filter(n -> n.canHost(sfc.getCpuRequiredCores(), sfc.getMemoryRequiredGb(), sfc.getBandwidthRequiredGbps()))
            .min(Comparator.comparingDouble(NetworkNode::getCarbonIntensityGco2Kwh));
    }

    /**
     * Multi-Criteria VNF Placement (MCVP) — used by autonomous agent migrations.
     *
     * Placement score (lower = better):
     *   score(n) = W_carbon  * norm(carbon)
     *            + W_latency * norm(latency)
     *            + W_cost    * norm(cost)
     *            + W_load    * norm(cpuLoad)
     *
     * Weights are SFC-priority-aware, aligned with 3GPP QoS class priorities:
     *   CRITICAL (URLLC): latency dominates  → W_l=0.50
     *   MEDIUM   (eMBB):  balanced           → W_c=0.35, W_l=0.25
     *   LOW      (mMTC):  carbon/cost focus  → W_c=0.45
     *
     * This mirrors the multi-objective reward function used by the PPO agent
     * (R = W_SLA·r_sla + W_CARBON·r_carbon + W_COST·r_cost + W_RESIL·r_resil).
     */
    public Optional<NetworkNode> findBestNode(ServiceFunctionChain sfc) {
        List<NetworkNode> candidates = nodeRepo.findCapableNodes(
                sfc.getCpuRequiredCores(), sfc.getMemoryRequiredGb())
            .stream()
            .filter(n -> n.canHost(sfc.getCpuRequiredCores(), sfc.getMemoryRequiredGb(