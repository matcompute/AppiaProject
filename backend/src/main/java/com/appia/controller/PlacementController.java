package com.appia.controller;

import com.appia.model.PlacementRecord;
import com.appia.repository.PlacementRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Appia — Placement Controller
 * Exposes real placement history and per-agent benchmark stats.
 * These endpoints replace hardcoded mock data in the frontend —
 * all paper results must come from here, not from PAPER_RESULTS constant.
 *
 * GET /api/v1/placements/history?hours=24  → per-hour carbon/cost/SLA for charts
 * GET /api/v1/placements/stats             → per-agent benchmark table (paper results)
 * GET /api/v1/placements/recent?limit=50   → raw placement log
 */
@RestController
@RequestMapping("/api/v1/placements")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class PlacementController {

    private final PlacementRecordRepository placementRepo;

    /**
     * Per-hour aggregated placement history for the carbon/SLA chart.
     * Returns one entry per hour for the last N hours:
     *   { hour, avgCarbon, avgCost, slaRate, placementCount, agent }
     */
    @GetMapping("/history")
    public ResponseEntity<List<Map<String, Object>>> getHistory(
            @RequestParam(defaultValue = "24") int hours) {

        Instant since = Instant.now().minus(hours, ChronoUnit.HOURS);
        List<PlacementRecord> records = placementRepo.findAll().stream()
            .filter(r -> r.getPlacedAt() != null && r.getPlacedAt().isAfter(since))
            .collect(Collectors.toList());

        // Group by hour bucket
        Map<Integer, List<PlacementRecord>> byHour = new TreeMap<>();
        for (PlacementRecord r : records) {
            int bucket = (int) ChronoUnit.HOURS.between(since, r.getPlacedAt());
            byHour.computeIfAbsent(Math.min(bucket, hours - 1), k -> new ArrayList<>()).add(r);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (int h = 0; h < hours; h++) {
            List<PlacementRecord> bucket = byHour.getOrDefault(h, Collections.emptyList());
            Map<String, Object> entry = new HashMap<>();
            entry.put("hour", h);
            entry.put("label", String.format("%02d:00", (since.plus(h, ChronoUnit.HOURS)
                .atZone(java.time.ZoneOffset.UTC).getHour())));
            entry.put("placementCount", bucket.size());

            if (bucket.isEmpty()) {
                entry.put("avgCarbon", null);
                entry.put("avgCost",   null);
                entry.put("slaRate",   null);
                entry.put("avgReward", null);
            } else {
                entry.put("avgCarbon", round2(bucket.stream()
                    .mapToDouble(PlacementRecord::getCarbonIntensityAtPlacement).average().orElse(0)));
                entry.put("avgCost", round4(bucket.stream()
                    .mapToDouble(PlacementRecord::getEnergyCostAtPlacement).average().orElse(0)));
                entry.put("slaRate", round2(bucket.stream()
                    .mapToDouble(r -> r.isSlaWasMet() ? 1.0 : 0.0).average().orElse(0) * 100));
                entry.put("avgReward", round3(bucket.stream()
                    .mapToDouble(PlacementRecord::getRewardSignal).average().orElse(0)));
                // dominant agent in this bucket
                entry.put("agent", bucket.stream()
                    .collect(Collectors.groupingBy(PlacementRecord::getDecisionMaker, Collectors.counting()))
                    .entrySet().stream().max(Map.Entry.comparingByValue())
                    .map(e -> e.getKey().name()).orElse("UNKNOWN"));
            }
            result.add(entry);
        }
        return ResponseEntity.ok(result);
    }

    /**
     * Per-agent benchmark statistics — this IS the paper results table.
     * Returns one entry per DecisionMaker with all metrics for comparison.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getBenchmarkStats() {
        List<PlacementRecord> all = placementRepo.findAll();

        if (all.isEmpty()) {
            return ResponseEntity.ok(Map.of("message", "No placement data yet — run the simulation first"));
        }

        Map<PlacementRecord.DecisionMaker, List<PlacementRecord>> byAgent =
            all.stream().collect(Collectors.groupingBy(PlacementRecord::getDecisionMaker));

        List<Map<String, Object>> agentStats = new ArrayList<>();
        for (Map.Entry<PlacementRecord.DecisionMaker, List<PlacementRecord>> entry : byAgent.entrySet()) {
            List<PlacementRecord> recs = entry.getValue();
            Map<String, Object> stat = new HashMap<>();
            stat.put("agent",           entry.getKey().name());
            stat.put("totalDecisions",  recs.size());
            stat.put("avgReward",       round3(recs.stream().mapToDouble(PlacementRecord::getRewardSignal).average().orElse(0)));
            stat.put("slaCompliancePct",round2(recs.stream().mapToDouble(r -> r.isSlaWasMet() ? 1.0 : 0.0).average().orElse(0) * 100));
            stat.put("avgCarbonGco2",   round2(recs.stream().mapToDouble(PlacementRecord::getCarbonIntensityAtPlacement).average().orElse(0)));
            stat.put("avgCostEur",      round4(recs.stream().mapToDouble(PlacementRecord::getEnergyCostAtPlacement).average().orElse(0)));
            stat.put("avgLatencyMs",    round2(recs.stream().mapToDouble(PlacementRecord::getAchievedLatencyMs).average().orElse(0)));
            stat.put("criticalViolations", recs.stream()
                .filter(r -> !r.isSlaWasMet() && r.getSfcPriority() == com.appia.model.ServiceFunctionChain.Priority.CRITICAL)
                .count());
            stat.put("shedCount", recs.stream()
                .filter(r -> r.getDecision() == PlacementRecord.PlacementDecision.SHED)
                .count());
            agentStats.add(stat);
        }

        // Sort by avgReward descending (PPO should be first)
        agentStats.sort((a, b) -> Double.compare(
            (Double) b.get("avgReward"), (Double) a.get("avgReward")));

        Map<String, Object> response = new HashMap<>();
        response.put("agents",         agentStats);
        response.put("totalRecords",    all.size());
        response.put("overallSlaRate",  round2(all.stream().mapToDouble(r -> r.isSlaWasMet() ? 1.0 : 0.0).average().orElse(0) * 100));
        response.put("overallAvgCarbon",round2(all.stream().mapToDouble(PlacementRecord::getCarbonIntensityAtPlacement).average().orElse(0)));
        response.put("generatedAt",     Instant.now().toString());
        return ResponseEntity.ok(response);
    }

    /**
     * Raw placement log — last N records, any agent.
     */
    @GetMapping("/recent")
    public ResponseEntity<List<PlacementRecord>> getRecent(
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(
            placementRepo.findRecentPlacements(
                org.springframework.data.domain.PageRequest.of(0, limit)));
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double round3(double v) { return Math.round(v * 1000.0) / 1000.0; }
    private static double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }
}
