package com.appia.model;

import javax.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.List;

/**
 * Appia — Network Slice Entity (Phase 9: Network Slicing)
 *
 * Implements 3GPP TS 28.541 Network Slice Management and
 * ETSI NFV EVE 012 network slicing architecture.
 *
 * The three standard 6G slice types (ITU-R IMT-2020/2030):
 *
 *  eMBB  — Enhanced Mobile Broadband
 *          High throughput, moderate latency
 *          Use cases: video streaming, CDN, AR/VR, cloud gaming
 *          Target: > 20 Gbps downlink, < 100ms latency
 *
 *  URLLC — Ultra-Reliable Low Latency Communications
 *          Sub-millisecond latency, six-nines reliability
 *          Use cases: emergency services, banking, autonomous vehicles,
 *                     industrial automation, remote surgery
 *          Target: < 1ms latency, 99.9999% reliability
 *
 *  mMTC  — massive Machine Type Communications
 *          Ultra-dense IoT, low power, relaxed latency
 *          Use cases: smart city sensors, agricultural IoT, logistics
 *          Target: 10^6 devices/km², years of battery life
 *
 * Slice Isolation: each slice has guaranteed resource quotas (CPU, BW, latency).
 * The orchestrator enforces isolation — one slice cannot starve another.
 *
 * Future (O-RAN): each slice maps to an O-RAN Network Slice Subnet Instance (NSSI).
 * The Near-RT RIC allocates RAN resources (PRBs) per slice via the E2 interface.
 *
 * Reference: 3GPP TS 28.541, 3GPP TS 23.501, ETSI NFV EVE 012,
 *            IETF RFC 9315, O-RAN Alliance WG1 Slicing Architecture
 */
@Entity
@Table(name = "network_slices")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NetworkSlice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String sliceId;            // "SLICE-URLLC-01"

    @Column(nullable = false)
    private String name;               // "Emergency & Banking URLLC"

    @Column(length = 500)
    private String description;

    // ── Slice type (3GPP) ─────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SliceType sliceType;       // eMBB, URLLC, mMTC

    // ── SLA requirements (per-slice contract) ─────────────────────────────────
    private double maxLatencyMs;           // URLLC: 1ms, eMBB: 100ms, mMTC: 10000ms
    private double minThroughputGbps;      // eMBB: 1Gbps, URLLC: 0.1, mMTC: 0.001
    private double targetReliabilityPct;   // URLLC: 99.9999, eMBB: 99.9, mMTC: 99.0
    private double maxJitterMs;            // URLLC: 0.5ms, eMBB: 10ms

    // ── Resource quota (slice isolation) ──────────────────────────────────────
    private double guaranteedCpuCores;     // reserved CPU across the slice
    private double guaranteedBandwidthGbps;
    private double maxCarbonGco2Kwh;       // green SLA: EU Green Deal per-slice carbon cap

    // ── Priority (for preemption during congestion) ───────────────────────────
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private SlicePriority priority = SlicePriority.MEDIUM;

    // ── Assigned SFCs (which chains belong to this slice) ─────────────────────
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "slice_sfcs", joinColumns = @JoinColumn(name = "slice_id"))
    @Column(name = "sfc_id")
    private List<String> assignedSfcIds;   // e.g. ["SFC-BANK-01", "SFC-EMERG-01"]

    // ── Live KPIs ─────────────────────────────────────────────────────────────
    @Builder.Default
    private double currentAvgLatencyMs  = 0.0;
    @Builder.Default
    private double currentAvgCarbon     = 0.0;
    @Builder.Default
    private double currentThroughputGbps = 0.0;
    @Builder.Default
    private double slaComplianceScore   = 100.0;  // 0-100

    // ── Admission control ──────────────────────────────────────────────────────
    @Builder.Default
    private int admissionRequests = 0;   // total SFC admission requests
    @Builder.Default
    private int admissionGranted  = 0;   // granted (resources available)
    @Builder.Default
    private int admissionRejected = 0;   // rejected (quota exceeded)

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private SliceStatus status = SliceStatus.ACTIVE;

    @Builder.Default
    private Instant createdAt = Instant.now();
    private Instant lastUpdatedAt;

    @PreUpdate
    public void touch() { this.lastUpdatedAt = Instant.now(); }

    // ── Enums ─────────────────────────────────────────────────────────────────

    public enum SliceType {
        /** Enhanced Mobile Broadband — high throughput, moderate latency */
        eMBB,
        /** Ultra-Reliable Low Latency — sub-ms, six nines */
        URLLC,
        /** massive Machine Type Comms — IoT, low power, relaxed latency */
        mMTC
    }

    public enum SlicePriority {
        CRITICAL,  // URLLC — preempts others during congestion
        MEDIUM,    // eMBB
        LOW        // mMTC — best-effort
    }

    public enum SliceStatus {
        ACTIVE,      // slice is live and serving traffic
        DEGRADED,    // SLA being violated — orchestrator responding
        SUSPENDED,   // slice temporarily halted (maintenance / isolation breach)
        TERMINATED   // slice lifecycle complete
    }
}
