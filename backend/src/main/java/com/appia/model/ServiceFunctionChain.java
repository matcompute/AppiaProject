package com.appia.model;

import javax.persistence.*;
import javax.validation.constraints.*;
import lombok.*;
import java.time.Instant;
import java.util.List;

/**
 * Appia — Service Function Chain (SFC) Entity
 *
 * An SFC is an ordered sequence of VNFs that network traffic must pass through.
 * Example: Traffic → [Firewall] → [Load Balancer] → [Application] → User
 *
 * Based on ETSI NFV and IETF RFC 7665 (SFC Architecture).
 * This is the enterprise-grade version of our Python simulation SFC model.
 */
@Entity
@Table(name = "service_function_chains")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ServiceFunctionChain {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    @Column(nullable = false, unique = true)
    private String sfcId;             // "SFC-BANK-01"

    @NotBlank
    private String name;              // "Banking Core API"

    @Column(length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Priority priority;        // CRITICAL, MEDIUM, LOW

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SfcStatus status;

    // ── VNF chain (ordered list of VNF types) ─────────────────────────────────
    // In a real deployment: Firewall → LoadBalancer → AppServer
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "sfc_vnf_chain", joinColumns = @JoinColumn(name = "sfc_id"))
    @Column(name = "vnf_type")
    @Enumerated(EnumType.STRING)
    private List<VnfType> vnfChain;   // ordered chain of VNF types

    // ── Resource requirements ─────────────────────────────────────────────────
    @Positive
    private double cpuRequiredCores;
    @Positive
    private double memoryRequiredGb;
    @Positive
    private double bandwidthRequiredGbps;

    // ── SLA Contract ──────────────────────────────────────────────────────────
    private double maxLatencyMs;          // e.g. 10.0ms for banking
    private double minAvailabilityPct;    // e.g. 99.99

    // ── Current placement ─────────────────────────────────────────────────────
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "assigned_node_id")
    private NetworkNode assignedNode;

    private double currentLatencyMs;
    private int slaViolationCount;

    // ── Deployment model ──────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private DeploymentModel deploymentModel = DeploymentModel.VNF;

    // For CNFs: Kubernetes namespace and replicas
    private String k8sNamespace;
    @Builder.Default
    private int replicaCount = 1;

    @Column(updatable = true)
    private Instant lastUpdated;

    @PrePersist @PreUpdate
    public void touch() { this.lastUpdated = Instant.now(); }

    // ── Derived ───────────────────────────────────────────────────────────────
    public boolean isSlaViolated() {
        if (status == SfcStatus.SHED || assignedNode == null) return true;
        return currentLatencyMs > maxLatencyMs;
    }

    public boolean canBeShed() {
        return priority == Priority.LOW;
    }

    // ── Enums ─────────────────────────────────────────────────────────────────
    public enum Priority { CRITICAL, MEDIUM, LOW }

    public enum SfcStatus { RUNNING, MIGRATING, DEGRADED, SHED }

    public enum DeploymentModel {
        VNF,   // VM-based — placed on a specific node
        CNF    // Container-based — placed in a K8s cluster on a node
    }
}
