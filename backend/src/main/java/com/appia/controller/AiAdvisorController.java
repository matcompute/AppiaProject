package com.appia.controller;

import com.appia.service.OrchestrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * Appia — Gemini AI Advisor REST Endpoints
 *
 * These endpoints power the "Ask Appia" chat panel in the React dashboard.
 * The operator can ask free-form questions about their network in plain English.
 */
@RestController
@RequestMapping("/api/v1/advisor")
@RequiredArgsConstructor
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:5174"})
public class AiAdvisorController {

    private final OrchestrationService orchestrationService;

    /**
     * GET /api/v1/advisor/recommendations
     * Returns 3 proactive AI recommendations for the current network state.
     */
    @GetMapping("/recommendations")
    public Map<String, String> getRecommendations() {
        String advice = orchestrationService.getAiRecommendations();
        return Map.of("recommendations", advice);
    }

    /**
     * POST /api/v1/advisor/ask
     * Body: { "question": "What happens if Frankfurt loses power?" }
     * Returns Gemini's natural-language scenario analysis.
     */
    @PostMapping("/ask")
    public Map<String, String> askAdvisor(@RequestBody Map<String, String> body) {
        String question = body.getOrDefault("question", "What is the current network health?");
        String answer = orchestrationService.analyzeScenario(question);
        return Map.of("question", question, "answer", answer);
    }

    /**
     * GET /api/v1/advisor/analytics
     * Returns key performance metrics for the dashboard analytics panel.
     */
    @GetMapping("/analytics")
    public Map<String, Object> getAnalytics() {
        return Map.of(
            "critical_violations_total", orchestrationService.getCriticalViolationCount(),
            "avg_carbon_when_sla_met",   orchestrationService.getAvgCarbonWhenSlaWasMet(),
            "recent_placements",         orchestrationService.getRecentPlacements(10)
        );
    }
}
