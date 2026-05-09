package com.appia.controller;

import com.appia.model.SfcHealthRecord;
import com.appia.service.AutonomousAgentService;
import com.appia.service.ResilienceService;
import com.appia.model.NetworkEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Appia — Resilience Controller (Phase 8)
 *
 * REST endpoints for 6G KPIs, health monitoring, and failover simulation.
 * Base path: /api/v1/resilience
 */
@RestController
@RequestMapping("/api/v1/resilience")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ResilienceController {

    private final ResilienceService    resilienceService;
    private final AutonomousAgentService agentService;

    /** Full 6G KPI report — network availability, MTTR, per-SFC breakdown */
    @GetMapping("/kpis")
    public ResponseEntity<Map<String, Object>> get6gKpis() {
        return ResponseEntity.ok(resilienceService.compute6gKpis());
    }

    /** Latest health record per SFC */
    @GetMapping("/health")
    public ResponseEntity<List<SfcHealthRecord>> getHealth() {
        return ResponseEntity.ok(resilienceService.getLatestHealthPerSfc());
    }

    /** Current active/standby map */
    @GetMapping("/standby")
    public ResponseEntity<Map<String, String>> getStandbyMap() {
        return ResponseEntity.ok(resilienceService.getStandbyMap());
    }

    /**
     * Simulate an SFC going DOWN — triggers HEAL lifecycle immediately.
     * POST /api/v1/resilience/simulate-failure/{sfcId}
     *
     * This is the live demo: "what happens when an SFC goes down?"
     * Answer: HEAL fires in < 200ms, SFC re-instantiated on best available node.
     */
    @PostMapping("/simulate-failure/{sfcId}")
    public ResponseEntity<?> simulateSfcFailure(@PathVariable String sfcId) {
        try {
            NetworkEvent event = agentService.handleEvent(
                NetworkEvent.EventType.NODE_FAILURE,
                "SIMULATED",
                sfcId,
                NetworkEvent.Severity.HIGH,
                "🔴 Simulated SFC failure: " + sfcId + " went DOWN — ETSI NFV HEAL triggered",
                null, null
            );
            return ResponseEntity.ok(Map.of(
                "message",      "Failure simulated for " + sfcId,
                "healAction",   event.getActionTaken().name(),
                "migratedTo",   event.getMigratedToNodeId() != null ? event.getMigratedToNodeId() : "N/A",
                "responseMs",   event.getResponseLatencyMs() != null ? event.getResponseLatencyMs() : 0,
                "status",       event.getStatus().name(),
                "aiReport",     event.getAiExplanation() != null ? event.getAiExplanation() : "Generating..."
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
