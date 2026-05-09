package com.appia.model;

import javax.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * Appia — Network Event Entity (Phase 6: Autonomous Event Agent)
 *
 * Records every detected anomaly and the autonomous response taken.
 * Supports ETSI ZSM (Zero-touch Service Management) closed-loop automation:
 *   DETECT → ANALYZE → DECIDE → ACT → VERIFY
 *
 * Event types cover:
 *  - Cyber incidents (NIS2 / DORA compliance triggers)
 *  - VNF lifecycle actions (ETSI NFV IFA)
 *  - SLA breaches (IETF RFC 7665)
 *  - Green energy events (EU Green Deal)
 */
@Entity
@Table(name = "network_events",
       indexes = {
           @Index(name = "idx_event_type",   columnList = "eventType"),
           @Index(name = "idx_event_status", columnList = "status"),
           @Index(name = "idx_event_node",   columnList = "affectedNodeId"),
           @Index(name = "idx_event_time",   columnList = "detectedAt"),
       })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NetworkEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ── What happened ──────────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EventType eventType;           // CYBER_ATTACK, NODE_FAILURE, …

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Severity severity = Severity.MEDIUM;

    @Column(nullable = false)
    private String affectedNodeId;         // e.g. "IT-MIL-01"

    private String affectedSfcId;          // optional — if SFC-specific

    @Column(length = 500)
    private String description;            // human-readable trigger description

    // Raw metric value that triggered the event (e.g. carbon=850, cpu=97.3)
    private Double triggerValue;
    private Double triggerThreshold;

    // ── What the agent did ────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private AgentAction actionTaken = AgentAction.NONE;

    private String migratedToNodeId;       // set when action = MIGRATE_SFC

    @Column(length = 2000)
    private String aiExplanation;          // Gemini incident report (NIS2 audit trail)

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private EventStatus status = EventStatus.DETECTED;

    @Builder.Default
    private Instant detectedAt  = Instant.now();
    private Instant respondedAt;
    private Instant resolvedAt;

    // Response latency in milliseconds (for ETSI ZSM SLA on automation)
    private Long responseLatencyMs;

    // ── Enums ─────────────────────────────────────────────────────────────────

    public enum EventType {
        /** Anomalous traffic pattern / port scan / DDoS signature detected */
        CYBER_ATTACK,

        /** Node went OFFLINE or health-check failed */
        NODE_FAILURE,

        /** SFC latency exceeded SLA contract threshold */
        SLA_BREACH,

        /** Carbon intensity spike above green threshold (EU Green Deal) */
        ENERGY_SPIKE,

        /** CPU or memory > 90% — pre-emptive scale-out */
        LOAD_SPIKE,

        /** Battery below 10% on an edge node with renewable */
        BATTERY_LOW,

        /** Node restored — trigger re-placement of shed SFCs */
        NODE_RECOVERY
    }

    public enum Severity {
        LOW,      // informational — log only
        MEDIUM,   // degraded — migrate or heal
        HIGH,     // critical — quarantine + migrate immediately
        CRITICAL  // catastrophic — shed non-essentials, alert, NIS2 report
    }

    public enum AgentAction {
        NONE,
        /** VNF/CNF migrated to a greener / healthier node */
        MIGRATE_SFC,
        /** SFC terminated (ETSI NFV: TERMINATE lifecycle op) */
        TERMINATE_VNF,
        /** SFC re-instantiated on a healthy node after failure */
        RECREATE_VNF,
        /** Scale-out: replica count increased (CNF only) */
        SCALE_OUT_CNF,
        /** Node quarantined — no new SFCs placed until cleared */
        QUARANTINE_NODE,
        /** Node de-quarantined — back in scheduling pool */
        DEQUARANTINE_NODE,
        /** LOW-priority SFC shed to free capacity */
        SHED_LOW_PRIORITY
    }

    public enum EventStatus {
        DETECTED,    // event raised, agent evaluating
        RESPONDING,  // agent action in progress
        RESOLVED,    // normal operation restored
        ESCALATED    // agent could not resolve — needs human intervention
    }
}
