package com.appia.model;

import javax.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * Appia — SLA Contract Entity
 * Formalizes the Service Level Agreement for each SFC.
 * Aligned with EU NIS2 Directive and DORA (Digital Operational Resilience Act).
 */
@Entity
@Table(name = "sla_contracts")
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class SlaContract {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sfc_id", unique = true)
    private ServiceFunctionChain sfc;

    // ── SLA thresholds ────────────────────────────────────────────────────────
    private double maxLatencyMs;              // Hard latency ceiling
    private double maxJitterMs;               // Acceptable jitter
    private double minAvailabilityPct;        // e.g. 99.999 = five-nines
    private double maxPacketLossPct;          // e.g. 0.001%
    private int    maxRecoveryTimeSec;        // RTO — Recovery Time Objective
    private int    maxDowntimePerMonthSec;    // RPO-derived downtime budget

    // ── Current compliance ────────────────────────────────────────────────────
    private double currentAvailabilityPct;
    private int    violationsThisMonth;
    private Instant lastViolationAt;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ComplianceStatus complianceStatus = ComplianceStatus.COMPLIANT;

    // ── Regulatory alignment ──────────────────────────────────────────────────
    private boolean nis2Applicable;    // EU NIS2 critical infrastructure
    private boolean doraApplicable;    // EU DORA financial sector
    private boolean gdprApplicable;    // EU GDPR data handling

    private Instant contractStartDate;
    private Instant lastEvaluatedAt;

    @PrePersist @PreUpdate
    public void stamp() { this.lastEvaluatedAt = Instant.now(); }

    public boolean isCurrentlyCompliant() {
        return complianceStatus == ComplianceStatus.COMPLIANT;
    }

    public enum ComplianceStatus { COMPLIANT, AT_RISK, BREACHED }
}
