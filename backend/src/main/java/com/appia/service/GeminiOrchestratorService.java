package com.appia.service;

import com.appia.model.NetworkEvent;
import com.appia.model.NetworkNode;
import com.appia.model.ServiceFunctionChain;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Appia — Gemini AI Orchestration Advisor
 *
 * Uses Google Gemini to provide natural-language explanations of placement
 * decisions and proactive recommendations for the network operator.
 *
 * Example queries:
 *   - "Why was Banking API moved from Frankfurt to Oslo?"
 *   - "What happens if Addis Ababa loses solar power right now?"
 *   - "Which nodes should I power down to save the most CO2 tonight?"
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GeminiOrchestratorService {

    @Value("${appia.gemini.api-key}")
    private String geminiApiKey;

    @Value("${appia.gemini.model}")
    private String geminiModel;

    @Value("${appia.gemini.api-url}")
    private String geminiApiUrl;

    private final ObjectMapper objectMapper;

    // Java 11 built-in HTTP client — synchronous, no reactor thread issues
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    // Simple 2-minute cache for recommendations to avoid 429 rate limits
    private final AtomicReference<String>  cachedRecs      = new AtomicReference<>(null);
    private volatile Instant               cacheExpiry     = Instant.EPOCH;
    private static final Duration          CACHE_TTL       = Duration.ofMinutes(2);

    /**
     * Ask Gemini to explain a placement decision in natural language.
     */
    public String explainPlacement(
        ServiceFunctionChain sfc,
        NetworkNode targetNode,
        List<NetworkNode> allNodes,
        double rewardSignal
    ) {
        String prompt =
            "You are the Appia AI Orchestration Advisor - an expert in green network infrastructure.\n\n" +
            "The RL optimization engine just placed the following service:\n\n" +
            "SERVICE: " + sfc.getName() + " (Priority: " + sfc.getPriority().name() + ")\n" +
            "PLACED ON: " + targetNode.getName() + " (" + targetNode.getLocationCode() + ")\n" +
            String.format("NODE CARBON: %.1f gCO2/kWh\n", targetNode.getCarbonIntensityGco2Kwh()) +
            String.format("NODE ENERGY COST: EUR %.4f/kWh\n", targetNode.getEnergyCostEurKwh()) +
            String.format("REWARD SIGNAL: %.3f\n\n", rewardSignal) +
            "NETWORK STATE:\n" + buildSystemContext(allNodes) + "\n\n" +
            "In 2-3 concise sentences, explain WHY this placement was a good decision " +
            "from an energy, cost, and SLA perspective. Be specific about the numbers. " +
            "End with one key insight for the network operator.";

        return callGemini(prompt);
    }

    /**
     * Ask Gemini for proactive recommendations given current network state.
     * Results are cached for 2 minutes to avoid 429 rate limits on free tier.
     */
    public String getProactiveRecommendations(List<NetworkNode> nodes, List<ServiceFunctionChain> sfcs) {
        // Return cached result if still fresh
        if (Instant.now().isBefore(cacheExpiry) && cachedRecs.get() != null) {
            log.debug("Returning cached recommendations (expires {})", cacheExpiry);
            return cachedRecs.get();
        }

        String prompt =
            "You are the Appia AI Orchestration Advisor for a green distributed network.\n\n" +
            "CURRENT NETWORK STATE:\n" + buildSystemContext(nodes) + "\n\n" +
            "SLA STATUS:\n" + buildSlaContext(sfcs) + "\n\n" +
            "Provide exactly 3 concise actionable recommendations for the network operator RIGHT NOW.\n" +
            "Focus on: 1) Carbon/energy optimization, 2) SLA risk warnings, 3) Resilience improvements.\n" +
            "Format each as: [ACTION REQUIRED / ADVISORY / INFO] Brief recommendation.\n" +
            "Use actual node names and numbers from the state above.";

        String result = callGemini(prompt);

        // Cache successful responses for 2 min; cache errors for 30s (back off on rate limits)
        if (!result.startsWith("AI advisor") && !result.startsWith("Gemini API error")) {
            cachedRecs.set(result);
            cacheExpiry = Instant.now().plus(CACHE_TTL);
        } else if (result.contains("429")) {
            // On rate limit: back off for 30s before trying again
            cachedRecs.set(result);
            cacheExpiry = Instant.now().plus(Duration.ofSeconds(30));
        }
        return result;
    }

    /**
     * "What-if" scenario analysis — operator asks a free-form question.
     */
    public String analyzeScenario(String operatorQuestion, List<NetworkNode> nodes, List<ServiceFunctionChain> sfcs) {
        String prompt =
            "You are the Appia AI Orchestration Advisor. The network operator asks:\n\n" +
            "QUESTION: \"" + operatorQuestion + "\"\n\n" +
            "CURRENT NETWORK STATE:\n" + buildSystemContext(nodes) + "\n\n" +
            "ACTIVE SERVICES:\n" + buildSlaContext(sfcs) + "\n\n" +
            "Answer in 3-5 sentences. Be specific about which services would be affected, " +
            "which nodes would absorb the load, and what the SLA impact would be. " +
            "If critical services (Banking, Health, Emergency) are at risk, say so explicitly.";

        return callGemini(prompt);
    }

    /**
     * Generate a NIS2/DORA-compliant incident report for an autonomous agent action.
     * Called by AutonomousAgentService after resolving a NetworkEvent.
     */
    public String generateIncidentReport(NetworkEvent event,
                                         List<NetworkNode> nodes,
                                         List<ServiceFunctionChain> sfcs) {
        String prompt =
            "You are the Appia AI Security & Compliance Advisor.\n\n" +
            "An autonomous network event has just been detected and resolved:\n\n" +
            "EVENT TYPE:    " + event.getEventType().name() + "\n" +
            "SEVERITY:      " + event.getSeverity().name() + "\n" +
            "AFFECTED NODE: " + event.getAffectedNodeId() + "\n" +
            "AFFECTED SFC:  " + (event.getAffectedSfcId() != null ? event.getAffectedSfcId() : "N/A") + "\n" +
            "DESCRIPTION:   " + event.getDescription() + "\n" +
            "ACTION TAKEN:  " + event.getActionTaken().name() + "\n" +
            (event.getMigratedToNodeId() != null ? "MIGRATED TO:   " + event.getMigratedToNodeId() + "\n" : "") +
            "RESPONSE TIME: " + (event.getResponseLatencyMs() != null ? event.getResponseLatencyMs() + "ms" : "N/A") + "\n\n" +
            "NETWORK STATE:\n" + buildSystemContext(nodes) + "\n\n" +
            "Write a concise incident report (3-4 sentences) suitable for NIS2 Article 21 compliance audit. " +
            "Include: what happened, what the autonomous agent did, the business impact, " +
            "and whether SLAs were maintained. Be specific about the response time and action taken.";

        return callGemini(prompt);
    }

    /**
     * Raw Gemini query — returns the exact text response with no wrapping.
     * Used by IntentEngineService to parse JSON responses.
     */
    public String rawQuery(String prompt) {
        return callGemini(prompt);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private String buildSystemContext(List<NetworkNode> nodes) {
        StringBuilder sb = new StringBuilder();
        for (NetworkNode n : nodes) {
            sb.append(String.format(
                "  - %s (%s): Carbon=%.0f gCO2/kWh, Cost=EUR %.4f/kWh, CPU=%.0f%%, Battery=%s, Status=%s%n",
                n.getName(), n.getLocationCode(),
                n.getCarbonIntensityGco2Kwh(), n.getEnergyCostEurKwh(),
                n.getCpuLoadPct(),
                n.getBatteryLevelPct() < 0 ? "N/A" : String.format("%.0f%%", n.getBatteryLevelPct()),
                n.getStatus().name()
            ));
        }
        return sb.toString();
    }

    private String buildSlaContext(List<ServiceFunctionChain> sfcs) {
        StringBuilder sb = new StringBuilder();
        for (ServiceFunctionChain sfc : sfcs) {
            String node = sfc.getAssignedNode() != null ? sfc.getAssignedNode().getName() : "UNPLACED";
            sb.append(String.format(
                "  - %s [%s] -> %s | Latency: %.1fms (max %.0fms) | SLA: %s%n",
                sfc.getName(), sfc.getPriority().name(),
                node, sfc.getCurrentLatencyMs(), sfc.getMaxLatencyMs(),
                sfc.isSlaViolated() ? "VIOLATED" : "OK"
            ));
        }
        return sb.toString();
    }

    /**
     * Call Gemini REST API using Java 11 HttpClient (synchronous, no reactor issues).
     */
    private String callGemini(String prompt) {
        try {
            // Build request body
            String requestBody = objectMapper.writeValueAsString(Map.of(
                "contents", List.of(
                    Map.of("parts", List.of(Map.of("text", prompt)))
                ),
                "generationConfig", Map.of(
                    "temperature",     0.4,
                    "maxOutputTokens", 512,
                    "topP",            0.8
                )
            ));

            String url = geminiApiUrl + "/" + geminiModel + ":generateContent?key=" + geminiApiKey;
            log.debug("Calling Gemini: {}", url.replace(geminiApiKey, "***"));

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .timeout(Duration.ofSeconds(30))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            log.debug("Gemini HTTP status: {}", response.statusCode());

            if (response.statusCode() != 200) {
                log.warn("Gemini API returned HTTP {}: {}", response.statusCode(), response.body());
                return "Gemini API error (HTTP " + response.statusCode() + "). Check logs for details.";
            }

            // Parse response
            Map<?, ?> responseMap = objectMapper.readValue(response.body(), Map.class);
            if (responseMap.containsKey("candidates")) {
                List<?> candidates = (List<?>) responseMap.get("candidates");
                if (!candidates.isEmpty()) {
                    Map<?, ?> candidate = (Map<?, ?>) candidates.get(0);
                    Map<?, ?> content   = (Map<?, ?>) candidate.get("content");
                    List<?>   parts     = (List<?>)   content.get("parts");
                    Map<?, ?> part      = (Map<?, ?>) parts.get(0);
                    return (String) part.get("text");
                }
            }

            log.warn("Gemini response had no candidates: {}", response.body());
            return "Gemini returned an empty response.";

        } catch (Exception e) {
            log.error("Gemini API call failed: {} — {}", e.getClass().getSimpleName(), e.getMessage());
            return "AI advisor temporarily offline: " + e.getMessage();
        }
    }
}
