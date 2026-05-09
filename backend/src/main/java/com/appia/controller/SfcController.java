package com.appia.controller;

import com.appia.model.PlacementRecord;
import com.appia.model.ServiceFunctionChain;
import com.appia.service.OrchestrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/sfcs")
@RequiredArgsConstructor
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:5174"})
public class SfcController {

    private final OrchestrationService orchestrationService;

    @GetMapping
    public List<ServiceFunctionChain> getAllSfcs() {
        return orchestrationService.getAllSfcs();
    }

    @GetMapping("/violations")
    public List<ServiceFunctionChain> getSlaViolators() {
        return orchestrationService.getSlaViolators();
    }

    @GetMapping("/critical-at-risk")
    public List<ServiceFunctionChain> getCriticalNotRunning() {
        return orchestrationService.getCriticalNotRunning();
    }

    /**
     * Place an SFC on a node — called by the RL engine or manually.
     * Body: { "node_id": "NO-OSLO-01", "reward": 0.87, "decision_maker": "PPO_AGENT" }
     */
    @PostMapping("/{sfcId}/place")
    public ResponseEntity<PlacementRecord> placeSfc(
            @PathVariable String sfcId,
            @RequestBody Map<String, Object> body) {

        String nodeId = (String) body.get("node_id");
        double reward = body.containsKey("reward") ? ((Number) body.get("reward")).doubleValue() : 0.0;
        String maker  = (String) body.getOrDefault("decision_maker", "PPO_AGENT");

        PlacementRecord.DecisionMaker dm;
        try { dm = PlacementRecord.DecisionMaker.valueOf(maker); }
        catch (Exception e) { dm = PlacementRecord.DecisionMaker.PPO_AGENT; }

        PlacementRecord record = orchestrationService.placeSfc(sfcId, nodeId, dm, reward);
        return ResponseEntity.ok(record);
    }

    /** Shed a LOW priority SFC to save energy */
    @PostMapping("/{sfcId}/shed")
    public ResponseEntity<Void> shedSfc(@PathVariable String sfcId) {
        orchestrationService.shedSfc(sfcId);
        return ResponseEntity.ok().build();
    }
}
