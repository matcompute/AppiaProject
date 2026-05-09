package com.appia.model;

import javax.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * Appia — SFC Health Record (Phase 8: Resilience & Self-Healing)
 *
 * Tracks every health check result for every SFC.
 * Foundation for:
 *  - MTTR (Mean Time To Recovery) — key 6G KPI
 *  - Six-nines reliability (99.9999%) calculation
 *  - ETSI NFV HEAL lifecycle operation audit trail
 *  - O-RAN xApp integration (future: reports to Near-RT RIC via E2 interface)
 *
 * 6G Target KPIs (ITU-R IMT-2030):
 *  - Reliability:    99.99999% (seven nines) for URLLC slices
 *  - Latency:        < 1ms E2E for critical services
 *  - MTTR:           < 50ms (autonomous self-healing)
 *  - Availability:   99.9999% (six nines)
 *
 * Future integration:
 *  - Open5GS: 5G core network (AMF/SMF/UPF)
 *  - UeRansim: RAN simulator (gNB + UE)
 *  - O-RAN Near-RT RIC: Appia becomes an xApp controlling the RAN
 *  - E2 interface: real-time RAN telemetry into Appia's Digital Twin
 */
@Entity
@Table(name = "sfc_health_records",
       indexes = {
           @Index(name = "idx_health_sfc",    columnList = "sfcId"),
           @Index(name = "idx_health_status",  columnList = "healthStatus"),
           @Index(name = "idx_health_checked", columnList = "checkedAt"),
       })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SfcHealthRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String sfcId;              // e.g. "SFC-BANK-01"

    private String nodeId;             // which node it was on at check time

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private HealthStatus healthStatus = HealthStatus.HEALTHY;

    // ── 6G KPI measurements ───────────────────────────────────────────────────
    private double measuredLatencyMs;  // actual E2E latency at check time
    private double slaLatencyMs;       // SLA contract max
    private boolean slaBreached;       // latency > SLA

    private double cpuLoadPct;         // node CPU at check time
    private double carbonGco2Kwh;      // carbon intensity at check time

    // ── HEAL tracking ──────────────────────────────────────────────────────────
    private boolean healTriggered;     // did this check trigger a HEAL action?
    private String healedToNodeId;     // where it was re-instantiated (if healed)
    private Long healLatencyMs;        // how long the HEAL took (ETSI NFV MTTR KPI)

    @Builder.Default
    private Instant checkedAt = Instant.now();

    // ── Availability window ───────────────────────────────────────────────────
    // Used to compute rolling 1-hour availability for the dashboard
    @Builder.Default
    private boolean available = true;  // was the SFC serving traffic at this check?

    public enum HealthStatus {
        HEALTHY,    // SFC running, SLA met, no issues
        DEGRADED,   // SFC running but SLA violated or high latency
        DOWN,       // SFC not running (no assigned node, or node offline)
        HEALING,    // HEAL triggered, waiting for re-instantiation
        STANDBY     // SFC is the passive replica of an active/standby pair
    }
}
