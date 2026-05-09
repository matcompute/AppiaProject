package com.appia.controller;

import com.appia.model.NetworkNode;
import com.appia.service.AutonomousAgentService;
import com.appia.service.IntentEngineService;
import com.appia.service.OrchestrationService;
import com.appia.service.SliceOrchestrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/nodes")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class NodeController {

    private final OrchestrationService orchestrationService;
    private final AutonomousAgentService agentService;
    private final IntentEngineService intentEngine;
    private final SliceOrchestrationService sliceService;

    @GetMapping
    public List<NetworkNode> getAllNodes() {
        return orchestrationService.getAllNodes();
    }

    @GetMapping("/{nodeId}")
    public ResponseEntity<NetworkNode> getNode(@PathVariable String nodeId) {
        return orchestrationService.getNode(nodeId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/green")
    public List<NetworkNode> getGreenNodes(@RequestParam(defaultValue = "150.0") double maxCarbon) {
        return orchestrationService.getGreenNodes(maxCarbon);
    }

    /**
     * Called by Python simulation / real telemetry every tick.
     * After updating telemetry, triggers both:
     *  - Autonomous agent scan (Phase 6: threshold-based event detection)
     *  - Intent engine enforcement (Phase 7: IBN policy evaluation)
     */
    @PatchMapping("/{nodeId}/telemetry")
    public ResponseEntity<NetworkNode> updateTelemetry(
            @PathVariable String nodeId,
            @RequestBody Map<String, Double> telemetry) {
        NetworkNode updated = orchestrationService.updateNodeTelemetry(
            nodeId,
            telemetry.getOrDefault("carbon_intensity", 0.0),
            telemetry.getOrDefault("energy_cost", 0.0),
            telemetry.getOrDefault("battery_level", -1.0),
            telemetry.getOrDefault("cpu_load", 0.0),
            telemetry.getOrDefault("memory_load", 0.0)
        );

        // Phase 6: scan for threshold events
        try { agentService.scanForEvents(); } catch (Exception ignored) {}
        // Phase 7: enforce active intents
        try { intentEngine.enforceAll(); } catch (Exception ignored) {}
        // Phase 9: refresh slice KPIs
        try { sliceService.refreshSliceKpis(); } catch (Exception ignored) {}

        return ResponseEntity.ok(updated);
    }

    @PostMapping
    public ResponseEntity<NetworkNode> createNode(@RequestBody NetworkNode node) {
        return ResponseEntity.ok(orchestrationService.saveNode(node));
    }
}
