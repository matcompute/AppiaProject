package com.appia.model;

/**
 * Appia — VNF/CNF Type Catalogue
 *
 * VNF  = Virtual Network Function  (runs on a VM/bare metal)
 * CNF  = Cloud-Native Network Function (runs in a container/Kubernetes pod)
 *
 * These map directly to real Telco/ETSI NFV standards.
 * Our SFCs from Phase 1 are composed of these building blocks.
 */
public enum VnfType {

    // ── Network VNFs ─────────────────────────────────────────────────────────
    FIREWALL("Firewall", "Network security filtering", DeploymentModel.VNF),
    LOAD_BALANCER("Load Balancer", "Traffic distribution across endpoints", DeploymentModel.VNF),
    NAT_GATEWAY("NAT Gateway", "Network Address Translation", DeploymentModel.VNF),
    VPN_GATEWAY("VPN Gateway", "Encrypted tunnel termination", DeploymentModel.VNF),
    IDS_IPS("IDS/IPS", "Intrusion Detection and Prevention", DeploymentModel.VNF),

    // ── Cloud-Native VNFs (CNFs) ─────────────────────────────────────────────
    SERVICE_MESH("Service Mesh", "Microservice-to-microservice traffic control (Istio/Envoy)", DeploymentModel.CNF),
    API_GATEWAY("API Gateway", "REST/gRPC API management and rate limiting", DeploymentModel.CNF),
    DNS_RESOLVER("DNS Resolver", "Cloud-native DNS with caching", DeploymentModel.CNF),
    CDN_EDGE("CDN Edge", "Content delivery at the network edge", DeploymentModel.CNF),

    // ── Application-Level VNFs ───────────────────────────────────────────────
    MEDIA_TRANSCODER("Media Transcoder", "Real-time video/audio encoding", DeploymentModel.VNF),
    DEEP_PACKET_INSPECTOR("DPI Engine", "Deep packet inspection for QoS", DeploymentModel.VNF),

    // ── 5G / Telco-Specific ───────────────────────────────────────────────────
    UPF("User Plane Function", "5G core user plane — routes user data", DeploymentModel.CNF),
    SMF("Session Management Function", "5G session lifecycle management", DeploymentModel.CNF),
    AMF("Access Management Function", "5G device registration and mobility", DeploymentModel.CNF);

    public final String displayName;
    public final String description;
    public final DeploymentModel deploymentModel;

    VnfType(String displayName, String description, DeploymentModel deploymentModel) {
        this.displayName = displayName;
        this.description = description;
        this.deploymentModel = deploymentModel;
    }

    public enum DeploymentModel {
        VNF,   // Virtual Machine based
        CNF    // Container / Kubernetes based
    }
}
