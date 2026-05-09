package com.appia.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import javax.persistence.*;
import javax.validation.constraints.*;
import lombok.*;
import java.time.Instant;

/**
 * Appia — Network Node Entity
 * Represents a physical/virtual network site in the Digital Twin.
 * Maps directly to what the Python simulation and React dashboard model.
 */
@Entity
@Table(name = "network_nodes")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class NetworkNode {

    @Id
    @Column(name = "node_id", nullable = false, unique = true)
    private String nodeId;                    // e.g. "NO-OSLO-01"

    @NotBlank
    @Column(nullable = false)
    private String name;                      // "Oslo Edge Node"

    @NotBlank
    @Column(nullable = false, length = 2)
    private String locationCode;              // "NO", "DK", "IT", "DE", "ET"

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NodeType nodeType;                // EDGE, CORE, DATA_CENTER

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NodeStatus status;               // ONLINE, DEGRADED, OFFLINE

    // ── Geographic coordinates ────────────────────────────────────────────────
    private double latitude;
    private double longitude;

    // ── Compute capacity ─────────────────────────────────────────────────────
    @Positive
    private double cpuCapacityCores;
    @Positive
    private double memoryCapacityGb;
    @Positive
    private double maxBandwidthGbps;
    private double processingLatencyMs;

    // ── Energy profile (live telemetry — updated by simulation) ──────────────
    private double carbonIntensityGco2Kwh;   // gCO2/kWh — live value
    private double energyCostEurKwh;         // €/kWh    — live value
    private double availablePowerKw;
    private double batteryLevelPct;          // -1 if no battery, 0-100 otherwise
    private boolean hasRenewable;
    private boolean hasBattery;
    private boolean hasBackupGenerator;

    // ── Current load (updated by orchestration engine) ───────────────────────
    @Builder.Default
    private double cpuLoadPct    = 0.0;
    @Builder.Default
    private double memoryLoadPct = 0.0;
    @Builder.Default
    private double bwLoadPct     = 0.0;

    @Column(updatable = true)
    private Instant lastUpdated;

    @PrePersist
    @PreUpdate
    public void touch() { this.lastUpdated = Instant.now(); }

    // ── Derived helpers ───────────────────────────────────────────────────────
    public boolean canHost(double cpuReq, double memReq, double bwReq) {
        if (status == NodeStatus.OFFLINE) return false;
        double availCpu = cpuCapacityCores * (1.0 - cpuLoadPct / 100.0);
        double availMem = memoryCapacityGb * (1.0 - memoryLoadPct / 100.0);
        double availBw  = maxBandwidthGbps * (1.0 - bwLoadPct / 100.0);
        return availCpu >= cpuReq && availMem >= memReq && availBw >= bwReq;
    }

    public enum NodeType   { EDGE, CORE, DATA_CENTER }
    public enum NodeStatus { ONLINE, DEGRADED, OFFLINE }
}
