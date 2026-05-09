package com.appia.controller;

import com.appia.model.NetworkEvent;
import com.appia.service.AutonomousAgentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Appia — Event Controller (Phase 6: Autonomous Event Agent)
 *
 * REST endpoints for:
 *  - Simulating / injecting network events (for demo + research paper)
 *  - Querying the event log (dashboard, NIS2 audit trail)
 *  - Checking quarantine status
 *
 * Base path: /api/v1/events
 */
@RestController
@RequestMapping("/api/v1/events")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class EventController {

    private final AutonomousAgentService agentService;

    // ── GET endpoints ─────────────────────────────────────────────────────────

    /** Returns the 50 most recent events (for the Event Log dashboard panel). */
    @GetMapping
    public ResponseEntity<List<NetworkEvent>> getRecentEvents() {
        return ResponseEntity.ok(agentService.getRecentEvents());
    }

    /** Returns all open (unresolved) incidents — for the dashboard alert banner. */
    @GetMapping("/open")
    public ResponseEntity<List<NetworkEvent>> getOpenIncidents() {
        return ResponseEntity.ok(agentService.getOpenIncidents());
    }

    /** Returns the set of currently quarantined node IDs. */
    @GetMapping("/quarantine")
    public ResponseEntity<Set<String>> getQuarantinedNodes() {
        return ResponseEntity.ok(agentService.getQuarantinedNodes());
    }

    // ── POST: simulate an event ───────────────────────────────────────────────

    /**
     * Inject a synthetic event — triggers the full autonomous response loop.
     *
     * Body:
     * {
     *   "event_type":       "CYBER_ATTACK",          // required
     *   "affected_node_id": "IT-MIL-01",             // required
     *   "affected_sfc_id":  "SFC-BANK-01",           // optional
     *   "severity":         "HIGH",                   // optional, default MEDIUM
     *   "description":      "DDoS signature detected" // optional
     *   "trigger_value":    850.5,                   // optional — raw metric
     *   "trigger_threshold": 600.0                   // optional — threshold
     * }
     *
     * Returns the fully resolved NetworkEvent with AI explanation.
     */
    @PostMapping("/simulate")
    public ResponseEntity<?> simulateEvent(@RequestBody Map<String, Object> body) {
        try {
            // Parse required fields
            String typeStr = (String) body.get("event_type");
            String nodeId  = (String) body.get("affected_node_id");

            if (typeStr == null || nodeId == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "event_type and affected_node_id are required"));
            }

            NetworkEvent.EventType type;
            try {
                type = NetworkEvent.EventType.valueOf(typeStr.toUpperCase());
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown event_type: " + typeStr +
                                 " — valid: CYBER_ATTACK, NODE_FAILURE, SLA_BREACH, ENERGY_SPIKE, LOAD_SPIKE, BATTERY_LOW, NODE_RECOVERY"));
            }

            // Optional fields with safe defaults
            String sfcId      = (String) body.get("affected_sfc_id");
            String sevStr     = (String) body.getOrDefault("severity", "MEDIUM");
            String description = (String) body.getOrDefault("description",
                                    "Simulated " + typeStr + " event on " + nodeId);

            NetworkEvent.Severity severity;
            try {
                severity = NetworkEvent.Severity.valueOf(sevStr.toUpperCase());
            } catch (IllegalArgumentException e) {
                severity = NetworkEvent.Severity.MEDIUM;
            }

            Double triggerValue     = body.get("trigger_value") != null
                                      ? ((Number) body.get("trigger_value")).doubleValue() : null;
            Double triggerThreshold = body.get("trigger_threshold") != null
                                      ? ((Number) body.get("trigger_threshold")).doubleValue() : null;

            log.info("[EVENT API] Simulating {} on {} (severity: {})", typeStr, nodeId, severity);

            NetworkEvent result = agentService.handleEvent(
                type, nodeId, sfcId, severity, description, triggerValue, triggerThreshold);

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("[EVENT API] Simulation failed: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Quick-fire presets for the React dashboard buttons.
     * POST /api/v1/events/preset/{name}
     *
     * Supported presets:
     *   cyber_milan       → CYBER_ATTACK on IT-MIL-01 (CRITICAL)
     *   node_failure_de   → NODE_FAILURE on DE-FRA-01 (HIGH)
     *   energy_spike      → ENERGY_SPIKE on DE-FRA-01 (MEDIUM)
     *   sla_breach_bank   → SLA_BREACH on SFC-BANK-01 (HIGH)
     *   load_spike_oslo   → LOAD_SPIKE on NO-OSLO-01 (MEDIUM)
     *   battery_low_et    → BATTERY_LOW on ET-ADD-01 (MEDIUM)
     *   recover_milan     → NODE_RECOVERY on IT-MIL-01 (LOW)
     */
    @PostMapping("/preset/{name}")
    public ResponseEntity<?> triggerPreset(@PathVariable String name) {
        try {
            NetworkEvent result;
            switch (name.toLowerCase()) {
                case "cyber_milan":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.CYBER_ATTACK, "IT-MIL-01", null,
                        NetworkEvent.Severity.CRITICAL,
                        "🚨 DDoS + lateral movement detected — Milan DC compromised (NIS2 Art.21 trigger)",
                        null, null);
                    break;
                case "node_failure_de":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.NODE_FAILURE, "DE-FRA-01", null,
                        NetworkEvent.Severity.HIGH,
                        "Frankfurt core node heartbeat lost — hardware failure suspected",
                        null, null);
                    break;
                case "energy_spike":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.ENERGY_SPIKE, "DE-FRA-01", null,
                        NetworkEvent.Severity.MEDIUM,
                        "Carbon intensity 824 gCO2/kWh — EU Green Deal workload migration triggered",
                        824.0, 600.0);
                    break;
                case "sla_breach_bank":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.SLA_BREACH, "IT-MIL-01", "SFC-BANK-01",
                        NetworkEvent.Severity.HIGH,
                        "Banking API latency 47ms exceeds 10ms SLA — DORA compliance at risk",
                        47.0, 10.0);
                    break;
                case "load_spike_oslo":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.LOAD_SPIKE, "NO-OSLO-01", null,
                        NetworkEvent.Severity.MEDIUM,
                        "Oslo edge node CPU 93% — auto-scaling triggered",
                        93.0, 88.0);
                    break;
                case "battery_low_et":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.BATTERY_LOW, "ET-ADD-01", null,
                        NetworkEvent.Severity.MEDIUM,
                        "Addis Ababa edge battery 8% — solar unavailable, preemptive VNF migration",
                        8.0, 12.0);
                    break;
                case "recover_milan":
                    result = agentService.handleEvent(
                        NetworkEvent.EventType.NODE_RECOVERY, "IT-MIL-01", null,
                        NetworkEvent.Severity.LOW,
                        "Milan DC cleared and restored to operational state",
                        null, null);
                    break;
                default:
                    return ResponseEntity.badRequest()
                        .body(Map.of("error", "Unknown preset: " + name));
            }

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("[EVENT API] Preset '{}' failed: {}", name, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body(Map.of("error", e.getMessage()));
        }
    }
}
