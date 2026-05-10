package com.appia.controller;

import com.appia.model.NetworkNode;
import com.appia.model.ServiceFunctionChain;
import com.appia.repository.NetworkNodeRepository;
import com.appia.repository.ServiceFunctionChainRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Appia — MCVP Explainability Controller
 *
 * Exposes the Multi-Criteria VNF Placement (MCVP) scoring breakdown for every
 * candidate node given a target SFC.  This makes the algorithm transparent and
 * is a key contribution for the NoF 2026 paper:
 *
 *   "Why was SFC-BANK-01 placed on NO-OSLO-01?"
 *   → carbon score: 0.08, latency score: 0.12, cost score: 0.06, load score: 0.22
 *   → total J(n) = 0.09  ← winner (lowest)
 *
 * GET /api/v1/mcvp/score?sfcId=SFC-BANK-01
 *   Returns: { sfc, weights, candidates: [{nodeId, score, breakdown, isWinner}] }
 *
 * GET /api/v1/mcvp/weights?priority=CRITICAL
 *   Returns: priority-aware weight vector (for dashboard legend)
 */
@RestController
@RequestMapping("/api/v1/mcvp")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class MCVPController {

    private final NetworkNodeRepository nodeRepo;
    private final ServiceFunctionChainRepository sfcRepo;

    // ── Weight table (mirrors OrchestrationService exactly) ───────────────────
    // Aligned with 3GPP QoS class priorities (TS 23.501 §5.7.2)
    // Java 11 compatible — no switch expressions
    private static double[] weights(ServiceFunctionChain.Priority p) {
        return switch (p) {
            case CRITICAL -> new double[]{0.20, 0.50, 0.10, 0.20}; // latency dominant (URLLC)
            case MEDIUM   -> new double[]{0.35, 0.25, 0.25, 0.15}; // balanced (eMBB)
            default       -> new double[]{0.45, 0.10, 0.35, 0.10}; // carbon/cost focus (mMTC)
        };
    }

    /**
     * Full MCVP score breakdown for all candidate nodes given an SFC.
     * This is the "explain placement" endpoint used by the dashboard's
     * MCVPExplainer panel.
     */
    @GetMapping("/score")
    public ResponseEntity<Map<String, Object>> score(@RequestParam String sfcId) {
        Optional<ServiceFunctionChain> sfcOpt = sfcRepo.findBySfcId(sfcId);
        if (sfcOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ServiceFunctionChain sfc = sfcOpt.get();
        List<NetworkNode> allNodes = nodeRepo.findAll();

        // Filter: only nodes that can host this SFC
        List<NetworkNode> candidates = allNodes.stream()
            .filter(n -> n.canHost(sfc.getCpuRequiredCores(),
                                   sfc.getMemoryRequiredGb(),
                                   sfc.getBandwidthRequiredGbps()))
            .collect(Collectors.toList());

        if (candidates.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("sfc", sfcSummary(sfc));
            empty.put("candidates", Collections.emptyList());
            empty.put("message", "No node has sufficient capacity for this SFC");
            return ResponseEntity.ok(empty);
        }

        // Normalisation ranges
        double maxCarbon  = candidates.stream().mapToDouble(NetworkNode::getCarbonIntensityGco2Kwh).max().orElse(1);
        double maxLatency = candidates.stream().mapToDouble(NetworkNode::getProcessingLatencyMs).max().orElse(1);
        double maxCost    = candidates.stream().mapToDouble(NetworkNode::getEnergyCostEurKwh).max().orElse(1);

        double[] w = weights(sfc.getPriority());

        // Score every candidate
        List<Map<String, Object>> scored = candidates.stream().map(n -> {
            double nC  = maxCarbon  > 0 ? n.getCarbonIntensityGco2Kwh() / maxCarbon  : 0;
            double nL  = maxLatency > 0 ? n.getProcessingLatencyMs()    / maxLatency : 0;
            double nP  = maxCost    > 0 ? n.getEnergyCostEurKwh()       / maxCost    : 0;
            double nLd = n.getCpuLoadPct() / 100.0;
            double J   = w[0]*nC + w[1]*nL + w[2]*nP + w[3]*nLd;

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("nodeId",      n.getNodeId());
            entry.put("nodeName",    n.getName());
            entry.put("locationCode",n.getLocationCode());
            entry.put("status",      n.getStatus().name());
            entry.put("totalScore",  round3(J));           // J(n) — lower is better

            // Raw metrics (for display)
            entry.put("carbonGco2",  n.getCarbonIntensityGco2Kwh());
            entry.put("latencyMs",   n.getProcessingLatencyMs());
            entry.put("costEur",     n.getEnergyCostEurKwh());
            entry.put("cpuLoadPct",  n.getCpuLoadPct());

            // Normalised components (for bar chart)
            Map<String, Object> breakdown = new LinkedHashMap<>();
            breakdown.put("carbon",  round3(w[0] * nC));
            breakdown.put("latency", round3(w[1] * nL));
            breakdown.put("cost",    round3(w[2] * nP));
            breakdown.put("load",    round3(w[3] * nLd));
            entry.put("breakdown", breakdown);

            // Flag whether this node is the current assigned node for this SFC
            String assignedId = sfc.getAssignedNode() != null ? sfc.getAssignedNode().getNodeId() : null;
            entry.put("isCurrentNode", n.getNodeId().equals(assignedId));
            return entry;
        })
        .sorted(Comparator.comparingDouble(e -> (Double) e.get("totalScore")))
        .collect(Collectors.toList());

        // Mark the winner (lowest J)
        if (!scored.isEmpty()) scored.get(0).put("isWinner", true);

        // Build response
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("sfc", sfcSummary(sfc));
        resp.put("weights", Map.of(
            "wCarbon",  w[0], "wLatency", w[1], "wCost", w[2], "wLoad", w[3],
            "priority", sfc.getPriority().name()
        ));
        resp.put("normRanges", Map.of(
            "maxCarbon", maxCarbon, "maxLatency", maxLatency, "maxCost", maxCost
        ));
        resp.put("candidates", scored);
        resp.put("ineligibleCount", allNodes.size() - candidates.size());
        return ResponseEntity.ok(resp);
    }

    /**
     * Weight vector for a given priority class — used by the dashboard legend
     * so the user can see WHY weights differ between CRITICAL/MEDIUM/LOW SFCs.
     */
    @GetMapping("/weights")
    public ResponseEntity<Map<String, Object>> getWeights(
            @RequestParam(defaultValue = "MEDIUM") String priority) {
        ServiceFunctionChain.Priority p;
        try { p = ServiceFunctionChain.Priority.valueOf(priority.toUpperCase()); }
        catch (IllegalArgumentException e) { p = ServiceFunctionChain.Priority.MEDIUM; }

        double[] w = weights(p);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("priority",  p.name());
        resp.put("wCarbon",   w[0]);
        resp.put("wLatency",  w[1]);
        resp.put("wCost",     w[2]);
        resp.put("wLoad",     w[3]);
        resp.put("rationale", switch (p) {
            case CRITICAL -> "URLLC: latency dominates (W_l=0.50). Meets 3GPP TS 22.261 §7.2 1ms E2E target.";
            case MEDIUM   -> "eMBB: balanced multi-criteria. Optimises throughput/energy trade-off.";
            default       -> "mMTC: carbon and cost dominate (W_c=0.45). Maximises green efficiency for IoT workloads.";
        });
        return ResponseEntity.ok(resp);
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private Map<String, Object> sfcSummary(ServiceFunctionChain sfc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sfcId",       sfc.getSfcId());
        m.put("name",        sfc.getName());
        m.put("priority",    sfc.getPriority().name());
        m.put("status",      sfc.getStatus().name());
        m.put("cpuRequired", sfc.getCpuRequiredCores());
        m.put("memRequired", sfc.getMemoryRequiredGb());
        m.put("bwRequired",  sfc.getBandwidthRequiredGbps());
        m.put("assignedNode",sfc.getAssignedNode() != null ? sfc.getAssignedNode().getNodeId() : null);
        return m;
    }

    private static double round3(dou