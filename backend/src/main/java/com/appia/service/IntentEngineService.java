package com.appia.service;

import com.appia.model.*;
import com.appia.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Appia — Intent-Based Networking Engine (Phase 7)
 * ==================================================
 * Implements IETF RFC 9315 + ETSI ZSM 006 intent-driven management.
 *
 * Two-phase operation:
 *
 *  Phase A — TRANSLATION (Gemini NLP):
 *    Operator types: "Keep Banking below 100g carbon at all times"
 *    Gemini returns structured JSON policy:
 *    { "type": "CARBON_LIMIT", "target": "SFC-BANK-01", "threshold": 100, "unit": "gCO2/kWh", "direction": "BELOW" }
 *
 *  Phase B — ENFORCEMENT (closed loop):
 *    Every telemetry tick → evaluate all active intents against live state
 *    If violated → invoke AutonomousAgentService to restore compliance
 *    Update compliance score (0-100%) for dashboard
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class IntentEngineService {

    private final NetworkIntentRepository    intentRepo;
    private final NetworkNodeRepository      nodeRepo;
    private final ServiceFunctionChainRepository sfcRepo;
    private final NetworkEventRepository     eventRepo;
    private final AutonomousAgentService     agentService;
    private final GeminiOrchestratorService  gemini;
    private final ObjectMapper               objectMapper;

    // ── Phase A: Translate natural language → structured policy ───────────────

    /**
     * Submit a new intent in natural language.
     * Gemini translates it; the intent is saved and immediately enforced.
     */
    public NetworkIntent submitIntent(String naturalLanguage) {
        log.info("[IBN] New intent submitted: \"{}\"", naturalLanguage);

        // Build the Gemini translation prompt
        String prompt =
            "You are an Intent-Based Networking (IBN) parser for a 5G/Edge network management system.\n\n" +
            "The operator has expressed this network management intent:\n" +
            "\"" + naturalLanguage + "\"\n\n" +
            "Parse this into a structured policy. Respond with ONLY valid JSON, no markdown, no explanation:\n" +
            "{\n" +
            "  \"policyType\": \"CARBON_LIMIT|ENERGY_COST_LIMIT|LATENCY_SLA|CPU_LOAD_LIMIT|SLA_PRIORITY|NODE_EXCLUSION|GREEN_PREFERENCE|UNKNOWN\",\n" +
            "  \"targetEntity\": \"<SFC ID like SFC-BANK-01, node ID like IT-MIL-01, or ALL>\",\n" +
            "  \"thresholdValue\": <numeric value or null>,\n" +
            "  \"thresholdUnit\": \"<gCO2/kWh|ms|EUR/kWh|%|null>\",\n" +
            "  \"direction\": \"BELOW|ABOVE|EQUAL\",\n" +
            "  \"explanation\": \"<1 sentence explaining how you interpreted the intent>\"\n" +
            "}\n\n" +
            "Known SFC IDs: SFC-BANK-01, SFC-HEALTH-01, SFC-EMERG-01, SFC-CORP-01, SFC-5G-UPF-01, SFC-CDN-01, SFC-STREAM-01, SFC-SOCIAL-01\n" +
            "Known node IDs: NO-OSLO-01, DK-CPH-01, IT-MIL-01, DE-FRA-01, ET-ADD-01\n" +
            "Use ALL if the intent applies network-wide.\n" +
            "If you cannot determine a specific threshold, use null and set policyType to UNKNOWN.";

        NetworkIntent intent = NetworkIntent.builder()
            .naturalLanguageIntent(naturalLanguage)
            .status(NetworkIntent.IntentStatus.ACTIVE)
            .build();

        try {
            String rawJson = gemini.rawQuery(prompt);
            // Strip any accidental markdown code fences
            rawJson = rawJson.replaceAll("```json\\s*", "").replaceAll("```\\s*", "").trim();

            Map<?, ?> parsed = objectMapper.readValue(rawJson, Map.class);

            intent.setPolicyType(parseEnum(NetworkIntent.PolicyType.class,
                                           (String) parsed.get("policyType"),
                                           NetworkIntent.PolicyType.UNKNOWN));
            intent.setTargetEntity((String) parsed.get("targetEntity"));
            intent.setThresholdUnit((String) parsed.get("thresholdUnit"));
            intent.setDirection(parseEnum(NetworkIntent.ThresholdDirection.class,
                                          (String) parsed.get("direction"),
                                          NetworkIntent.ThresholdDirection.BELOW));
            intent.setParsedExplanation((String) parsed.get("explanation"));

            Object tv = parsed.get("thresholdValue");
            if (tv instanceof Number) {
                intent.setThresholdValue(((Number) tv).doubleValue());
            }

            log.info("[IBN] Parsed: type={} target={} threshold={}{} direction={}",
                     intent.getPolicyType(), intent.getTargetEntity(),
                     intent.getThresholdValue(), intent.getThresholdUnit(), intent.getDirection());

        } catch (Exception e) {
            log.warn("[IBN] Gemini parse failed, storing as UNKNOWN: {}", e.getMessage());
            intent.setPolicyType(NetworkIntent.PolicyType.UNKNOWN);
            intent.setParsedExplanation("Could not parse intent — please rephrase with a specific metric and threshold.");
        }

        intent = intentRepo.save(intent);

        // Immediately enforce the new intent
        enforceIntent(intent);
        return intentRepo.findById(intent.getId()).orElse(intent);
    }

    // ── Phase B: Enforce all active intents ───────────────────────────────────

    /**
     * Evaluate all active/violated intents against current network state.
     * Called after every telemetry update (PATCH /nodes/{id}/telemetry).
     * This IS the ETSI ZSM closed loop.
     */
    public void enforceAll() {
        List<NetworkIntent> intents = intentRepo.findEnforceableIntents();
        if (intents.isEmpty()) return;

        List<NetworkNode> nodes = nodeRepo.findAll();
        List<ServiceFunctionChain> sfcs = sfcRepo.findAll();

        for (NetworkIntent intent : intents) {
            enforceIntent(intent, nodes, sfcs);
        }
    }

    public void enforceIntent(NetworkIntent intent) {
        enforceIntent(intent, nodeRepo.findAll(), sfcRepo.findAll());
    }

    private void enforceIntent(NetworkIntent intent,
                                List<NetworkNode> nodes,
                                List<ServiceFunctionChain> sfcs) {

        if (intent.getPolicyType() == null
                || intent.getPolicyType() == NetworkIntent.PolicyType.UNKNOWN
                || intent.getStatus() == NetworkIntent.IntentStatus.PAUSED) {
            return;
        }

        intent.setLastCheckedAt(Instant.now());
        boolean violated = false;
        String enforcementAction = null;

        try {
            switch (intent.getPolicyType()) {

                case CARBON_LIMIT:
                    violated = enforceCarbonLimit(intent, nodes, sfcs);
                    break;

                case ENERGY_COST_LIMIT:
                    violated = enforceEnergyCostLimit(intent, nodes, sfcs);
                    break;

                case LATENCY_SLA:
                    violated = enforceLatencySla(intent, sfcs);
                    break;

                case CPU_LOAD_LIMIT:
                    violated = enforceCpuLimit(intent, nodes);
                    break;

                case GREEN_PREFERENCE:
                    violated = enforceGreenPreference(intent, nodes, sfcs);
                    break;

                case SLA_PRIORITY:
                case NODE_EXCLUSION:
                    violated = false; // advisory — logged but no auto-action
                    break;

                default:
                    break;
            }
        } catch (Exception e) {
            log.error("[IBN] Enforcement error for intent {}: {}", intent.getId(), e.getMessage());
        }

        if (violated) {
            intent.setViolationCount(intent.getViolationCount() + 1);
            intent.setLastViolatedAt(Instant.now());
            intent.setStatus(NetworkIntent.IntentStatus.VIOLATED);
            // Degrade compliance score (recovers 10 points per clean check)
            intent.setComplianceScore(Math.max(0, intent.getComplianceScore() - 15));
            log.warn("[IBN] Intent {} VIOLATED (count: {}): {}", intent.getId(),
                     intent.getViolationCount(), intent.getNaturalLanguageIntent());
        } else {
            intent.setStatus(NetworkIntent.IntentStatus.SATISFIED);
            // Recover compliance score
            intent.setComplianceScore(Math.min(100, intent.getComplianceScore() + 10));
        }

        if (enforcementAction != null) {
            intent.setLastEnforcementAction(enforcementAction);
        }

        intentRepo.save(intent);
    }

    // ── Individual policy enforcers ───────────────────────────────────────────

    private boolean enforceCarbonLimit(NetworkIntent intent,
                                        List<NetworkNode> nodes,
                                        List<ServiceFunctionChain> sfcs) {
        if (intent.getThresholdValue() == null) return false;
        double limit = intent.getThresholdValue();
        boolean anyViolation = false;

        // Determine which SFCs to check
        List<ServiceFunctionChain> targets = resolveSfcTargets(intent.getTargetEntity(), sfcs);

        for (ServiceFunctionChain sfc : targets) {
            if (sfc.getAssignedNode() == null) continue;
            double carbon = sfc.getAssignedNode().getCarbonIntensityGco2Kwh();

            boolean exceeds = intent.getDirection() == NetworkIntent.ThresholdDirection.BELOW
                              ? carbon > limit : carbon < limit;

            if (exceeds) {
                anyViolation = true;
                log.info("[IBN] Carbon intent violated: SFC {} on {} has {}gCO2 (limit: {})",
                         sfc.getSfcId(), sfc.getAssignedNode().getNodeId(), carbon, limit);

                // Trigger green migration via autonomous agent
                agentService.handleEvent(
                    NetworkEvent.EventType.ENERGY_SPIKE,
                    sfc.getAssignedNode().getNodeId(),
                    sfc.getSfcId(),
                    NetworkEvent.Severity.MEDIUM,
                    String.format("IBN carbon intent violated: %.0f gCO2/kWh > %.0f limit for %s",
                                  carbon, limit, sfc.getSfcId()),
                    carbon, limit
                );
            }
        }
        return anyViolation;
    }

    private boolean enforceEnergyCostLimit(NetworkIntent intent,
                                            List<NetworkNode> nodes,
                                            List<ServiceFunctionChain> sfcs) {
        if (intent.getThresholdValue() == null) return false;
        double limit = intent.getThresholdValue();

        List<ServiceFunctionChain> targets = resolveSfcTargets(intent.getTargetEntity(), sfcs);
        for (ServiceFunctionChain sfc : targets) {
            if (sfc.getAssignedNode() == null) continue;
            double cost = sfc.getAssignedNode().getEnergyCostEurKwh();
            if (cost > limit) {
                agentService.handleEvent(
                    NetworkEvent.EventType.ENERGY_SPIKE,
                    sfc.getAssignedNode().getNodeId(),
                    sfc.getSfcId(),
                    NetworkEvent.Severity.MEDIUM,
                    String.format("IBN cost intent violated: €%.4f/kWh > €%.4f limit for %s",
                                  cost, limit, sfc.getSfcId()),
                    cost, limit
                );
                return true;
            }
        }
        return false;
    }

    private boolean enforceLatencySla(NetworkIntent intent, List<ServiceFunctionChain> sfcs) {
        if (intent.getThresholdValue() == null) return false;
        double maxLatency = intent.getThresholdValue();

        List<ServiceFunctionChain> targets = resolveSfcTargets(intent.getTargetEntity(), sfcs);
        for (ServiceFunctionChain sfc : targets) {
            if (sfc.getCurrentLatencyMs() > maxLatency) {
                agentService.handleEvent(
                    NetworkEvent.EventType.SLA_BREACH,
                    sfc.getAssignedNode() != null ? sfc.getAssignedNode().getNodeId() : "UNKNOWN",
                    sfc.getSfcId(),
                    NetworkEvent.Severity.HIGH,
                    String.format("IBN latency intent violated: %.1fms > %.1fms SLA for %s",
                                  sfc.getCurrentLatencyMs(), maxLatency, sfc.getSfcId()),
                    sfc.getCurrentLatencyMs(), maxLatency
                );
                return true;
            }
        }
        return false;
    }

    private boolean enforceCpuLimit(NetworkIntent intent, List<NetworkNode> nodes) {
        if (intent.getThresholdValue() == null) return false;
        double limit = intent.getThresholdValue();

        List<NetworkNode> targets = resolveNodeTargets(intent.getTargetEntity(), nodes);
        for (NetworkNode node : targets) {
            if (node.getCpuLoadPct() > limit) {
                agentService.handleEvent(
                    NetworkEvent.EventType.LOAD_SPIKE,
                    node.getNodeId(),
                    null,
                    NetworkEvent.Severity.MEDIUM,
                    String.format("IBN CPU intent violated: %.1f%% > %.1f%% limit on %s",
                                  node.getCpuLoadPct(), limit, node.getNodeId()),
                    node.getCpuLoadPct(), limit
                );
                return true;
            }
        }
        return false;
    }

    private boolean enforceGreenPreference(NetworkIntent intent,
                                            List<NetworkNode> nodes,
                                            List<ServiceFunctionChain> sfcs) {
        // Check if any SFC is on a non-renewable node when a renewable option exists
        List<ServiceFunctionChain> targets = resolveSfcTargets(intent.getTargetEntity(), sfcs);
        Optional<NetworkNode> greenest = nodes.stream()
            .filter(n -> n.isHasRenewable() && n.getStatus() == NetworkNode.NodeStatus.ONLINE)
            .min(Comparator.comparingDouble(NetworkNode::getCarbonIntensityGco2Kwh));

        if (greenest.isEmpty()) return false;

        for (ServiceFunctionChain sfc : targets) {
            if (sfc.getAssignedNode() != null
                    && !sfc.getAssignedNode().isHasRenewable()
                    && !sfc.getAssignedNode().getNodeId().equals(greenest.get().getNodeId())) {
                // Not on a renewable node — migrate
                agentService.handleEvent(
                    NetworkEvent.EventType.ENERGY_SPIKE,
                    sfc.getAssignedNode().getNodeId(),
                    sfc.getSfcId(),
                    NetworkEvent.Severity.LOW,
                    String.format("IBN green preference: migrating %s from non-renewable %s to %s",
                                  sfc.getSfcId(),
                                  sfc.getAssignedNode().getNodeId(),
                                  greenest.get().getNodeId()),
                    null, null
                );
                return true;
            }
        }
        return false;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<ServiceFunctionChain> resolveSfcTargets(String target,
                                                           List<ServiceFunctionChain> sfcs) {
        if (target == null || target.equalsIgnoreCase("ALL")) return sfcs;
        // Try exact SFC ID match first
        return sfcs.stream()
            .filter(s -> s.getSfcId().equalsIgnoreCase(target)
                      || s.getName().toLowerCase().contains(target.toLowerCase())
                      || (s.getPriority() != null
                          && s.getPriority().name().equalsIgnoreCase(target)))
            .collect(Collectors.toList());
    }

    private List<NetworkNode> resolveNodeTargets(String target, List<NetworkNode> nodes) {
        if (target == null || target.equalsIgnoreCase("ALL")) return nodes;
        return nodes.stream()
            .filter(n -> n.getNodeId().equalsIgnoreCase(target)
                      || n.getName().toLowerCase().contains(target.toLowerCase()))
            .collect(Collectors.toList());
    }

    private <T extends Enum<T>> T parseEnum(Class<T> cls, String value, T defaultVal) {
        if (value == null) return defaultVal;
        try { return Enum.valueOf(cls, value.toUpperCase()); }
        catch (IllegalArgumentException e) { return defaultVal; }
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────

    public List<NetworkIntent> getAllIntents() {
        return intentRepo.findAllByOrderByCreatedAtDesc();
    }

    public Optional<NetworkIntent> getIntent(Long id) {
        return intentRepo.findById(id);
    }

    public NetworkIntent pauseIntent(Long id) {
        NetworkIntent intent = intentRepo.findById(id)
            .orElseThrow(() -> new RuntimeException("Intent not found: " + id));
        intent.setStatus(NetworkIntent.IntentStatus.PAUSED);
        return intentRepo.save(intent);
    }

    public NetworkIntent resumeIntent(Long id) {
        NetworkIntent intent = intentRepo.findById(id)
            .orElseThrow(() -> new RuntimeException("Intent not found: " + id));
        intent.setStatus(NetworkIntent.IntentStatus.ACTIVE);
        return intentRepo.save(intent);
    }

    public void deleteIntent(Long id) {
        intentRepo.deleteById(id);
    }

    public Map<String, Object> getComplianceSummary() {
        long total    = intentRepo.count();
        long violated = intentRepo.countViolated();
        Double avgScore = intentRepo.avgComplianceScore();
        return Map.of(
            "total",            total,
            "violated",         violated,
            "satisfied",        total - violated,
            "avgCompliance",    avgScore != null ? Math.round(avgScore) : 100,
            "overallStatus",    violated == 0 ? "COMPLIANT" : "VIOLATIONS_DETECTED"
        );
    }
}
