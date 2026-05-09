package com.appia.controller;

import com.appia.service.SliceOrchestrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Appia — Slice Controller (Phase 9: Network Slicing)
 * Base path: /api/v1/slices
 */
@RestController
@RequestMapping("/api/v1/slices")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class SliceController {

    private final SliceOrchestrationService sliceService;

    @GetMapping
    public ResponseEntity<?> getAllSlices() {
        return ResponseEntity.ok(sliceService.getAllSlices());
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getSummary() {
        return ResponseEntity.ok(sliceService.getSliceSummary());
    }

    @GetMapping("/{sliceId}")
    public ResponseEntity<?> getSlice(@PathVariable String sliceId) {
        return sliceService.getSlice(sliceId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /** Check if an SFC can be admitted to a slice */
    @PostMapping("/{sliceId}/admit/{sfcId}")
    public ResponseEntity<?> checkAdmission(@PathVariable String sliceId,
                                             @PathVariable String sfcId) {
        try {
            SliceOrchestrationService.AdmissionResult result =
                sliceService.checkAdmission(sliceId, sfcId);
            return ResponseEntity.ok(Map.of(
                "admitted", result.admitted,
                "reason",   result.reason
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
