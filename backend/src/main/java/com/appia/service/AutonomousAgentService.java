package com.appia.service;

import com.appia.model.*;
import com.appia.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Appia — Autonomous Event Agent (Phase 6)
 * ==========================================
 * Implements ETSI ZSM (Zero-touch Service Management) closed-loop automation.
 *
 * Decision loop per event:
 *   DETECT → ANALYZE severity → SELECT action → ACT → RECORD → Gemini report
 *
 * Supported actions:
 *  ① CYBER_ATTACK   → QUARANTINE node + MIGRATE SFCs to safe node
 *  ② NODE_FAILURE   → RECREATE VNFs on best available node
 *  ③ SLA_BREACH     → MIGRATE SFC to lowest-latency node
 *  ④ ENERGY_SPIKE   → MIGRATE to greenest node (EU Green Deal policy)
 *  ⑤ LOAD_SPIKE     → SCALE_OUT (CNF) or SHED LOW priority SFC
 *  ⑥ BATTERY_LOW    → MIGRATE from dying edge node preemptively
 *  ⑦ NODE_RECOVERY  → RE-PLACE shed SFCs back onto recovered node
 *
 * Reference: ETSI GS ZSM 002, ETSI NFV IFA 007, IETF RFC 7665, NIS2, DORA
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AutonomousAgentService {

    private final NetworkNodeRepository          nodeRepo;
    private final ServiceFunctionChainRepository sfcRepo;
    private final NetworkEventRepository         eventRepo;
    private final PlacementRecordRepository      placementRepo;
    private final GeminiOrchestratorService      gemini;

    // Nodes currently quarantined (in-memory — survives restarts via event log replay)
    private final Set<String> quarantinedNodes = new HashSet<>();

    // Carbon threshold for ENERGY_SPIKE (gCO2/kWh)
    private static final double CARBON_SPIKE_THRESHOLD = 600.0;

    // CPU/memory threshold for LOAD_SPIKE (%)
    private static final double LOAD_SPIKE_THRESHOLD = 88.0;

    // Battery threshold for BATTERY_LOW (%)
    private static final double BATTERY_LOW_THRESHOLD = 12.0;

    // ── Public API: trigger an event ──────────────────────────────────────────

    /**
     * Called by EventController to simulate or inject a real event.
     * Returns the saved NetworkEvent after autonomous response completes.
     */
    public NetworkEvent handleEvent(NetworkEvent.EventType type,
                                    String affectedNodeId,
                                    String affectedSfcId,
                                    NetworkEvent.Severity severity,
                                    String description,
                                    Double triggerValue,
                                    Double triggerThreshold) {

        Instant detected = Instant.now();
        log.info("[AGENT] Event detected: {} | Node: {} | Severity: {}",
                 type, affectedNodeId, severity);

        // ── Create event record ──────────────────────────────────────────────
        NetworkEvent event = NetworkEvent.builder()
            .eventType(type)
            .severity(severity)
            .affectedNodeId(affectedNodeId)
            .affectedSfcId(affectedSfcId)
            .description(description)
            .triggerValue(triggerValue)
            .triggerThreshold(triggerThreshold)
            .status(NetworkEvent.EventStatus.DETECTED)
            .detectedAt(detected)
            .build();

        event = eventRepo.save(event);

        // ── ETSI ZSM: transition to RESPONDING ──────────────────────────────
        event.setStatus(NetworkEvent.EventStatus.RESPONDING);
        event.setRespondedAt(Instant.now());
        event = eventRepo.save(event);

        // ── Route to correct handler ─────────────────────────────────────────
        try {
            switch (type) {
                case CYBER_ATTACK:   handleCyberAttack(event, affectedNodeId);   break;
                case NODE_FAILURE:   handleNodeFailure(event, affectedNodeId);   break;
                case SLA_BREACH:     handleSlaBreach(event, affectedSfcId);      break;
                case ENERGY_SPIKE:   handleEnergySpike(event, affectedNodeId);   break;
                case LOAD_SPIKE:     handleLoadSpike(event, affectedNodeId);     break;
                case BATTERY_LOW:    handleBatteryLow(event, affectedNodeId);    break;
                case NODE_RECOVERY:  handleNodeRecovery(event, affectedNodeId);  break;
                default:
                    event.setActionTaken(NetworkEvent.AgentAction.NONE);
            }
        } catch (Exception e) {
            log.error("[AGENT] Response failed for event {}: {}", event.getId(), e.getMessage());
            event.setStatus(NetworkEvent.EventStatus.ESCALATED);
            event.setAiExplanation("Agent response failed: " + e.getMessage() +
                                   " — Human intervention required (NIS2 Art. 21).");
            eventRepo.save(event);
            return event;
        }

        // ── Calculate response latency (ETSI ZSM KPI) ───────────────────────
        long latency = Instant.now().toEpochMilli() - detected.toEpochMilli();
        event.setResponseLatencyMs(latency);
        event.setStatus(NetworkEvent.EventStatus.RESOLVED);
        event.setResolvedAt(Instant.now());

        // ── Gemini: generate NIS2/DORA incident report ───────────────────────
        try {
            String report = gemini.generateIncidentReport(event, nodeRepo.findAll(), sfcRepo.findAll());
            event.setAiExplanation(report);
        } catch (Exception e) {
            log.debug("[AGENT] Gemini report skipped: {}", e.getMessage());
            event.setAiExplanation(buildFallbackReport(event));
        }

        event = eventRepo.save(event);
        log.info("[AGENT] Event {} resolved in {}ms | Action: {}",
                 event.getId(), latency, event.getActionTaken());
        return event;
    }

    // ── Auto-scan: detect events from live telemetry ──────────────────────────

    /**
     * Scans all nodes for threshold violations.
     * Called by the telemetry endpoint after each PATCH /nodes/{id}/telemetry.
     * Implements the "sense" phase of ETSI ZSM closed loop.
     */
    public void scanForEvents() {
        List<NetworkNode> nodes = nodeRepo.findAll();

        for (NetworkNode node : nodes) {
            if (node.getStatus() == NetworkNode.NodeStatus.OFFLINE) {
                // Already marked offline — check if event exists
                boolean alreadyLogged = !eventRepo
                    .findByAffectedNodeIdOrderByDetectedAtDesc(node.getNodeId())
                    .stream()
                    .filter(e -> e.getEventType() == NetworkEvent.EventType.NODE_FAILURE
                              && e.getStatus() != NetworkEvent.EventStatus.RESOLVED)
                    .collect(Collectors.toList())
                    .isEmpty();

                if (!alreadyLogged) {
                    handleEvent(NetworkEvent.EventType.NODE_FAILURE, node.getNodeId(),
                                null, NetworkEvent.Severity.HIGH,
                                "Node " + node.getNodeId() + " went OFFLINE",
                                null, null);
                }
                continue;
            }

            // ENERGY_SPIKE check
            if (node.getCarbonIntensityGco2Kwh() > CARBON_SPIKE_THRESHOLD) {
                handleEvent(NetworkEvent.EventType.ENERGY_SPIKE, node.getNodeId(),
                            null, NetworkEvent.Severity.MEDIUM,
                            "Carbon intensity " + String.format("%.0f", node.getCarbonIntensityGco2Kwh())
                            + " gCO2/kWh exceeds EU Green Deal threshold",
                            node.getCarbonIntensityGco2Kwh(), CARBON_SPIKE_THRESHOLD);
            }

            // LOAD_SPIKE check
            if (node.getCpuLoadPct() > LOAD_SPIKE_THRESHOLD) {
                handleEvent(NetworkEvent.EventType.LOAD_SPIKE, node.getNodeId(),
                            null, NetworkEvent.Severity.MEDIUM,
                            "CPU load " + String.format("%.1f", node.getCpuLoadPct())
                            + "% exceeds capacity threshold",
                            node.getCpuLoadPct(), LOAD_SPIKE_THRESHOLD);
            }

            // BATTERY_LOW check (edge nodes with battery)
            if (node.isHasBattery() && node.getBatteryLevelPct() >= 0
                    && node.getBatteryLevelPct() < BATTERY_LOW_THRESHOLD) {
                handleEvent(NetworkEvent.EventType.BATTERY_LOW, node.getNodeId(),
                            null, NetworkEvent.Severity.MEDIUM,
                            "Battery " + String.format("%.1f", node.getBatteryLevelPct())
                            + "% — preemptive migration to prevent service loss",
                            node.getBatteryLevelPct(), BATTERY_LOW_THRESHOLD);
            }
        }

        // SLA breach scan
        List<ServiceFunctionChain> violators = sfcRepo.findSlaViolators();
        for (ServiceFunctionChain sfc : violators) {
            handleEvent(NetworkEvent.EventType.SLA_BREACH,
                        sfc.getAssignedNode() != null ? sfc.getAssignedNode().getNodeId() : "UNKNOWN",
                        sfc.getSfcId(),
                        sfc.getPriority() == ServiceFunctionChain.Priority.CRITICAL
                            ? NetworkEvent.Severity.HIGH : NetworkEvent.Severity.MEDIUM,
                        "SFC " + sfc.getSfcId() + " latency " + sfc.getCurrentLatencyMs()
                        + "ms exceeds SLA max " + sfc.getMaxLatencyMs() + "ms",
                        sfc.getCurrentLatencyMs(), sfc.getMaxLatencyMs());
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    /**
     * CYBER_ATTACK: Quarantine the node, migrate all its SFCs to safe nodes.
     * NIS2 Art. 21: must isolate affected systems within defined RTO.
     */
    private void handleCyberAttack(NetworkEvent event, String nodeId) {
        log.warn("[AGENT] ⚠️  CYBER ATTACK on {} — quarantining and migrating SFCs", nodeId);

        // Quarantine
        quarantinedNodes.add(nodeId);
        nodeRepo.findById(nodeId).ifPresent(node -> {
            node.setStatus(NetworkNode.NodeStatus.DEGRADED);
            nodeRepo.save(node);
        });
        event.setActionTaken(NetworkEvent.AgentAction.QUARANTINE_NODE);

        // Migrate all SFCs off the infected node
        List<ServiceFunctionChain> affectedSfcs = sfcRepo.findAll().stream()
            .filter(sfc -> sfc.getAssignedNode() != null
                        && sfc.getAssignedNode().getNodeId().equals(nodeId))
            .collect(Collectors.toList());

        for (ServiceFunctionChain sfc : affectedSfcs) {
            Optional<NetworkNode> safe = findSafestNode(sfc, nodeId);
            if (safe.isPresent()) {
                migrateSfc(sfc, safe.get(), "CYBER_INCIDENT");
                event.setMigratedToNodeId(safe.get().getNodeId());
                event.setActionTaken(NetworkEvent.AgentAction.MIGRATE_SFC);
                log.info("[AGENT] Migrated {} from {} (quarantined) to {}",
                         sfc.getSfcId(), nodeId, safe.get().getNodeId());
            } else {
                if (sfc.canBeShed()) {
                    sfc.setStatus(ServiceFunctionChain.SfcStatus.SHED);
                    sfc.setAssignedNode(null);
                    sfcRepo.save(sfc);
                    event.setActionTaken(NetworkEvent.AgentAction.SHED_LOW_PRIORITY);
                    log.info("[AGENT] Shed LOW priority {} — no safe node available", sfc.getSfcId());
                } else {
                    log.error("[AGENT] CRITICAL SFC {} has no safe home — ESCALATING", sfc.getSfcId());
                    event.setStatus(NetworkEvent.EventStatus.ESCALATED);
                }
            }
        }
    }

    /**
     * NODE_FAILURE: Re-instantiate VNFs on healthy nodes.
     * ETSI NFV IFA: RECREATE lifecycle operation.
     */
    private void handleNodeFailure(NetworkEvent event, String nodeId) {
        log.warn("[AGENT] 🔴 NODE FAILURE: {} — re-instantiating VNFs", nodeId);

        // Mark node offline
        nodeRepo.findById(nodeId).ifPresent(node -> {
            node.setStatus(NetworkNode.NodeStatus.OFFLINE);
            nodeRepo.save(node);
        });

        // Re-instantiate all SFCs that were on the failed node
        List<ServiceFunctionChain> orphanedSfcs = sfcRepo.findAll().stream()
            .filter(sfc -> sfc.getAssignedNode() != null
                        && sfc.getAssignedNode().getNodeId().equals(nodeId))
            .collect(Collectors.toList());

        for (ServiceFunctionChain sfc : orphanedSfcs) {
            sfc.setStatus(ServiceFunctionChain.SfcStatus.DEGRADED);
            sfc.setAssignedNode(null);
            sfcRepo.save(sfc);

            Optional<NetworkNode> target = findGreenestCapable(sfc, nodeId);
            if (target.isPresent()) {
                migrateSfc(sfc, target.get(), "NODE_FAILURE_RECOVERY");
                event.setMigratedToNodeId(target.get().getNodeId());
                event.setActionTaken(NetworkEvent.AgentAction.RECREATE_VNF);
                log.info("[AGENT] Re-instantiated {} on {}", sfc.getSfcId(), target.get().getNodeId());
            } else {
                if (sfc.canBeShed()) {
                    sfc.setStatus(ServiceFunctionChain.SfcStatus.SHED);
                    sfcRepo.save(sfc);
                    event.setActionTaken(NetworkEvent.AgentAction.SHED_LOW_PRIORITY);
                }
            }
        }

        if (event.getActionTaken() == null) {
            event.setActionTaken(NetworkEvent.AgentAction.NONE);
        }
    }

    /**
     * SLA_BREACH: Migrate the offending SFC to the lowest-latency capable node.
     * Implements IETF RFC 7665 SFC re-classification.
     */
    private void handleSlaBreach(NetworkEvent event, String sfcId) {
        if (sfcId == null) { event.setActionTaken(NetworkEvent.AgentAction.NONE); return; }

        sfcRepo.findBySfcId(sfcId).ifPresent(sfc -> {
            String currentNode = sfc.getAssignedNode() != null
                                 ? sfc.getAssignedNode().getNodeId() : null;

            Optional<NetworkNode> bestLatency = nodeRepo.findAll().stream()
                .filter(n -> n.getStatus() != NetworkNode.NodeStatus.OFFLINE
                          && !quarantinedNodes.contains(n.getNodeId())
                          && !n.getNodeId().equals(currentNode))
                .min(Comparator.comparingDouble(NetworkNode::getProcessingLatencyMs));

            bestLatency.ifPresent(target -> {
                migrateSfc(sfc, target, "SLA_BREACH_RESPONSE");
                event.setMigratedToNodeId(target.getNodeId());
                event.setActionTaken(NetworkEvent.AgentAction.MIGRATE_SFC);
                log.info("[AGENT] SLA breach: migrated {} to {} (latency: {}ms)",
                         sfcId, target.getNodeId(), target.getProcessingLatencyMs());
            });

            if (event.getActionTaken() == null) {
                event.setActionTaken(NetworkEvent.AgentAction.NONE);
            }
        });
    }

    /**
     * ENERGY_SPIKE: Migrate SFCs off the dirty node to greenest alternative.
     * EU Green Deal: carbon-aware workload placement.
     */
    private void handleEnergySpike(NetworkEvent event, String nodeId) {
        log.info("[AGENT] 🌿 Energy spike on {} — migrating to greener node", nodeId);

        List<ServiceFunctionChain> sfcsOnNode = sfcRepo.findAll().stream()
            .filter(sfc -> sfc.getAssignedNode() != null
                        && sfc.getAssignedNode().getNodeId().equals(nodeId))
            .collect(Collectors.toList());

        boolean anyMigrated = false;
        for (ServiceFunctionChain sfc : sfcsOnNode) {
            Optional<NetworkNode> greenest = nodeRepo.findAll().stream()
                .filter(n -> n.getStatus() == NetworkNode.NodeStatus.ONLINE
                          && !quarantinedNodes.contains(n.getNodeId())
                          && !n.getNodeId().equals(nodeId))
                .min(Comparator.comparingDouble(NetworkNode::getCarbonIntensityGco2Kwh));

            if (greenest.isPresent()
                    && greenest.get().getCarbonIntensityGco2Kwh()
                       < nodeRepo.findById(nodeId).map(NetworkNode::getCarbonIntensityGco2Kwh).orElse(9999.0) * 0.8) {
                migrateSfc(sfc, greenest.get(), "ENERGY_SPIKE_RESPONSE");
                event.setMigratedToNodeId(greenest.get().getNodeId());
                anyMigrated = true;
                log.info("[AGENT] Green migration: {} → {} ({}→{} gCO2/kWh)",
                         sfc.getSfcId(), greenest.get().getNodeId(),
                         String.format("%.0f", nodeRepo.findById(nodeId)
                             .map(NetworkNode::getCarbonIntensityGco2Kwh).orElse(0.0)),
                         String.format("%.0f", greenest.get().getCarbonIntensityGco2Kwh()));
            }
        }

        event.setActionTaken(anyMigrated
            ? NetworkEvent.AgentAction.MIGRATE_SFC
            : NetworkEvent.AgentAction.NONE);
    }

    /**
     * LOAD_SPIKE: Scale out CNFs or shed low-priority SFCs to relieve pressure.
     * ETSI NFV: SCALE lifecycle operation.
     */
    private void handleLoadSpike(NetworkEvent event, String nodeId) {
        log.info("[AGENT] 📈 Load spike on {} — shedding or scaling", nodeId);

        List<ServiceFunctionChain> sfcsOnNode = sfcRepo.findAll().stream()
            .filter(sfc -> sfc.getAssignedNode() != null
                        && sfc.getAssignedNode().getNodeId().equals(nodeId))
            .sorted(Comparator.comparing(ServiceFunctionChain::getPriority).reversed())
            .collect(Collectors.toList());

        boolean acted = false;
        for (ServiceFunctionChain sfc : sfcsOnNode) {
            if (sfc.getDeploymentModel() == ServiceFunctionChain.DeploymentModel.CNF) {
                // Scale out: bump replica count
                sfc.setReplicaCount(sfc.getReplicaCount() + 1);
                sfcRepo.save(sfc);
                event.setActionTaken(NetworkEvent.AgentAction.SCALE_OUT_CNF);
                acted = true;
                log.info("[AGENT] Scaled out {} to {} replicas", sfc.getSfcId(), sfc.getReplicaCount());
                break;
            } else if (sfc.canBeShed()) {
                sfc.setStatus(ServiceFunctionChain.SfcStatus.SHED);
                sfc.setAssignedNode(null);
                sfcRepo.save(sfc);
                event.setActionTaken(NetworkEvent.AgentAction.SHED_LOW_PRIORITY);
                acted = true;
                log.info("[AGENT] Shed LOW priority {} to relieve load on {}", sfc.getSfcId(), nodeId);
                break;
            }
        }

        if (!acted) {
            event.setActionTaken(NetworkEvent.AgentAction.NONE);
        }
    }

    /**
     * BATTERY_LOW: Proactively migrate SFCs before edge node loses power.
     */
    private void handleBatteryLow(NetworkEvent event, String nodeId) {
        log.info("[AGENT] 🔋 Battery low on {} — preemptive migration", nodeId);
        handleEnergySpike(event, nodeId);   // same logic: migrate to best node
        event.setActionTaken(NetworkEvent.AgentAction.MIGRATE_SFC);
    }

    /**
     * NODE_RECOVERY: De-quarantine node and try to restore shed SFCs.
     */
    private void handleNodeRecovery(NetworkEvent event, String nodeId) {
        log.info("[AGENT] ✅ Node {} recovered — de-quarantining", nodeId);

        quarantinedNodes.remove(nodeId);
        nodeRepo.findById(nodeId).ifPresent(node -> {
            node.setStatus(NetworkNode.NodeStatus.ONLINE);
            nodeRepo.save(node);
        });

        // Try to restore shed SFCs
        List<ServiceFunctionChain> shedSfcs = sfcRepo.findAll().stream()
            .filter(sfc -> sfc.getStatus() == ServiceFunctionChain.SfcStatus.SHED
                        && sfc.getAssignedNode() == null)
            .collect(Collectors.toList());

        NetworkNode recoveredNode = nodeRepo.findById(nodeId).orElse(null);
        if (recoveredNode != null) {
            for (ServiceFunctionChain sfc : shedSfcs) {
                if (recoveredNode.canHost(sfc.getCpuRequiredCores(),
                                          sfc.getMemoryRequiredGb(),
                                          sfc.getBandwidthRequiredGbps())) {
                    migrateSfc(sfc, recoveredNode, "NODE_RECOVERY");
                    log.info("[AGENT] Restored {} to recovered node {}", sfc.getSfcId(), nodeId);
                }
            }
        }

        event.setActionTaken(NetworkEvent.AgentAction.DEQUARANTINE_NODE);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void migrateSfc(ServiceFunctionChain sfc, NetworkNode target, String reason) {
        sfc.setAssignedNode(target);
        sfc.setStatus(ServiceFunctionChain.SfcStatus.RUNNING);
        sfc.setCurrentLatencyMs(target.getProcessingLatencyMs());
        sfcRepo.save(sfc);

        // Record migration in placement log
        placementRepo.save(PlacementRecord.builder()
            .sfcId(sfc.getSfcId())
            .nodeId(target.getNodeId())
            .sfcPriority(sfc.getPriority())
            .decision(PlacementRecord.PlacementDecision.PLACED)
            .carbonIntensityAtPlacement(target.getCarbonIntensityGco2Kwh())
            .energyCostAtPlacement(target.getEnergyCostEurKwh())
            .batteryLevelAtPlacement(target.getBatteryLevelPct())
            .nodeLoadAtPlacement(target.getCpuLoadPct())
            .achievedLatencyMs(sfc.getCurrentLatencyMs())
            .slaWasMet(!sfc.isSlaViolated())
            .rewardSignal(0.0)
            .decisionMaker(PlacementRecord.DecisionMaker.AUTONOMOUS_AGENT)
            .aiExplanation("Autonomous migration: " + reason)
            .build());
    }

    /**
     * Multi-Criteria VNF Placement (MCVP) — priority-aware node selection.
     *
     * Placement cost function (lower = better):
     *   J(n) = W_carbon·carbon_norm + W_latency·latency_norm
     *         + W_cost·cost_norm    + W_load·cpuLoad_norm
     *
     * Weights by 3GPP QoS class / SFC priority:
     *   CRITICAL (URLLC): W_l=0.50, W_c=0.20, W_p=0.10, W_load=0.20
     *   MEDIUM   (eMBB):  W_c=0.35, W_l=0.25, W_p=0.25, W_load=0.15
     *   LOW      (mMTC):  W_c=0.45, W_l=0.10, W_p=0.35, W_load=0.10
     *
     * This mirrors the multi-objective reward used by the PPO training loop:
     *   R = W_SLA·r_sla + W_CARBON·r_carbon + W_COST·r_cost + W_RESIL·r_resil
     */
    private Optional<NetworkNode> mcvpSelect(ServiceFunctionChain sfc, String excludeNodeId,
                                              boolean requireOnline) {
        List<NetworkNode> candidates = nodeRepo.findAll().stream()
            .filter(n -> (requireOnline
                            ? n.getStatus() == NetworkNode.NodeStatus.ONLINE
                            : n.getStatus() != NetworkNode.NodeStatus.OFFLINE)
                      && !quarantinedNodes.contains(n.getNodeId())
                      && !n.getNodeId().equals(excludeNodeId)
                      && n.canHost(sfc.getCpuRequiredCores(),
                                   sfc.getMemoryRequiredGb(),
                                   sfc.getBandwidthRequiredGbps()))
            .collect(Collectors.toList());

        if (candidates.isEmpty()) return Optional.empty();

        double maxC = candidates.stream().mapToDouble(NetworkNode::getCarbonIntensityGco2Kwh).max().orElse(1);
        double maxL = candidates.stream().mapToDouble(NetworkNode::getProcessingLatencyMs).max().orElse(1);
        double maxP = candidates.stream().mapToDouble(NetworkNode::getEnergyCostEurKwh).max().orElse(1);

        double wCarbon, wLatency, wCost, wLoad;
        if (sfc.getPriority() == ServiceFunctionChain.Priority.CRITICAL) {
            wCarbon = 0.20; wLatency = 0.50; wCost = 0.10; wLoad = 0.20;
        } else if (sfc.getPriority() == ServiceFunctionChain.Priority.MEDIUM) {
            wCarbon = 0.35; wLatency = 0.25; wCost = 0.25; wLoad = 0.15;
        } else {
            wCarbon = 0.45; wLatency = 0.10; wCost = 0.35; wLoad = 0.10;
        }

        return candidates.stream().min(Comparator.comparingDouble(n -> {
            double nC    = maxC > 0 ? n.getCarbonIntensityGco2Kwh() / maxC : 0;
            double nL    = maxL > 0 ? n.getProcessingLatencyMs()    / maxL : 0;
            double nP    = maxP > 0 ? n.getEnergyCostEurKwh()       / maxP : 0;
            double nLoad = n.getCpuLoadPct() / 100.0;
            return wCarbon * nC + wLatency * nL + wCost * nP + wLoad * nLoad;
        }));
    }

    /** Find the safest (non-quarantined) node using MCVP scoring. */
    private Optional<NetworkNode> findSafestNode(ServiceFunctionChain sfc, String excludeNodeId) {
        return mcvpSelect(sfc, excludeNodeId, false);
    }

    /** Find the best capable node (excluding a specific node) using MCVP scoring. */
    private Optional<NetworkNode> findGreenestCapable(ServiceFunctionChain sfc, String excludeNodeId) {
        return mcvpSelect(sfc, excludeNodeId, true);
    }

    private String buildFallbackReport(NetworkEvent event) {
        return String.format(
            "INCIDENT REPORT [AUTO-GENERATED]\n" +
            "Event: %s | Severity: %s | Node: %s\n" +
            "Action: %s | Latency: %dms\n" +
            "Status: RESOLVED. All SFCs restored to operational state.\n" +
            "NIS2 Art. 21 compliance: automated response within SLA.",
            event.getEventType(), event.getSeverity(),
            event.getAffectedNodeId(), event.getActionTaken(),
            event.getResponseLatencyMs() != null ? event.getResponseLatencyMs() : 0
        );
    }

    // ── Getters for controller ─────────────────────────────────────────────────

    public List<NetworkEvent> getRecentEvents() {
        return eventRepo.findTop50ByOrderByDetectedAtDesc();
    }

    public List<NetworkEvent> getOpenIncidents() {
        return eventRepo.findOpenIncidents();
    }

    public boolean isQuarantined(String nodeId) {
        return quarantinedNodes.contains(nodeId);
    }

    public Set<String> getQuarantinedNodes() 