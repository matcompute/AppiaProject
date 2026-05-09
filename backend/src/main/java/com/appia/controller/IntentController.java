package com.appia.controller;

import com.appia.model.NetworkIntent;
import com.appia.service.IntentEngineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Appia — Intent Controller (Phase 7: Intent-Based Networking)
 *
 * REST API for the IBN engine.
 * Base path: /api/v1/intents
 *
 * POST /api/v1/intents          — submit a natural-language intent
 * GET  /api/v1/intents          — list all intents
 * GET  /api/v1/intents/summary  — compliance dashboard summary
 * PUT  /api/v1/intents/{id}/pause  — pause enforcement
 * PUT  /api/v1/intents/{id}/resume — resume enforcement
 * DELETE /api/v1/intents/{id}   — delete intent
 */
@RestController
@RequestMapping("/api/v1/intents")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class IntentController {

    private final IntentEngineService intentEngine;

    @GetMapping
    public ResponseEntity<List<NetworkIntent>> getAllIntents() {
        return ResponseEntity.ok(intentEngine.getAllIntents());
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getComplianceSummary() {
        return ResponseEntity.ok(intentEngine.getComplianceSummary());
    }

    /**
     * Submit a new network intent in natural language.
     *
     * Body: { "intent": "Keep Banking SFC carbon below 100 gCO2/kWh at all times" }
     */
    @PostMapping
    public ResponseEntity<?> submitIntent(@RequestBody Map<String, String> body) {
        String intentText = body.get("intent");
        if (intentText == null || intentText.isBlank()) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "Request body must contain 'intent' field"));
        }

        log.info("[INTENT API] Submitted: \"{}\"", intentText);

        try {
            NetworkIntent result = intentEngine.submitIntent(intentText);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("[INTENT API] Failed to process intent: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}/pause")
    public ResponseEntity<?> pauseIntent(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(intentEngine.pauseIntent(id));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}/resume")
    public ResponseEntity<?> resumeIntent(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(intentEngine.resumeIntent(id));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIntent(@PathVariable Long id) {
        intentEngine.deleteIntent(id);
        return ResponseEntity.noContent().build();
    }
}
