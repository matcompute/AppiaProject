package com.appia.model;

import javax.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * Appia — Network Intent Entity (Phase 7: Intent-Based Networking)
 *
 * Implements the IETF Intent-Based Networking (IBN) model (RFC 9315).
 * An Intent is a high-level, declarative policy expressed in natural language.
 * The Intent Engine translates it into machine-enforceable constraints
 * and continuously validates the network against them.
 *
 * Examples:
 *   "Keep all Banking SFCs below 100 gCO2/kWh at all times"
 *   "Never place Emergency services on nodes above 80% CPU load"
 *   "Minimize energy cost for streaming services during off-peak hours"
 *   "Guarantee 99.99% SLA for all CRITICAL priority services"
 *
 * Reference: IETF RFC 9315, ETSI ZSM 006 (Intent-driven management)
 */
@Entity
@Table(name = "network_intents",
       indexes = {
           @Index(name = "idx_intent_status", columnList = "status"),
           @Index(name = "idx_intent_type",   columnList = "policyType"),
       })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NetworkIntent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ── Natural language input (what the operator typed) ──────────────────────
    @Column(nullable = false, length = 500)
    private String naturalLanguageIntent;      // raw operator input

    // ── Gemini-parsed policy ──────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    private PolicyType policyType;             // what category Gemini classified it as

    private String targetEntity;               // SFC ID, node ID, or "ALL"
    private Double thresholdValue;             // numeric limit (carbon, latency, cost, cpu%)
    private String thresholdUnit;              // "gCO2/kWh", "ms", "EUR/kWh", "%"

    @Enumerated(EnumType.STRING)
    private ThresholdDirection direction;      // BELOW / ABOVE / EQUAL

    // Gemini's explanation of how it interpreted the intent
    @Column(length = 1000)
    private String parsedExplanation;

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private IntentStatus status = IntentStatus.ACTIVE;

    @Builder.Default
    private Instant createdAt = Instant.now();
    private Instant lastCheckedAt;
    private Instant lastViolatedAt;

    // How many times this intent has been violated (for SLA reporting)
    @Builder.Default
    private int violationCount = 0;

    // Last enforcement action taken (human-readable summary)
    @Column(length = 500)
    private String lastEnforcementAction;

    // Current compliance score 0-100
    @Builder.Default
    private double complianceScore = 100.0;

    // ── Enums ─────────────────────────────────────────────────────────────────

    public enum PolicyType {
        CARBON_LIMIT,       // carbon intensity threshold for SFC placement
        ENERGY_COST_LIMIT,  // €/kWh cap
        LATENCY_SLA,        // max latency for SFC
        CPU_LOAD_LIMIT,     // node CPU % cap before migration
        SLA_PRIORITY,       // always keep a priority class running
        NODE_EXCLUSION,     // never place SFCs on specific nodes
        GREEN_PREFERENCE,   // prefer renewable-powered nodes
        UNKNOWN             // Gemini couldn't parse — needs human clarification
    }

    public enum ThresholdDirection {
        BELOW,   // metric must stay below threshold
        ABOVE,   // metric must stay above threshold
        EQUAL    // metric must equal threshold
    }

    public enum IntentStatus {
        ACTIVE,    // being enforced
        SATISFIED, // currently compliant
        VIOLATED,  // constraint broken — agent responding
        PAUSED,    // manually paused by operator
        EXPIRED    // no longer applicable
    }
}
