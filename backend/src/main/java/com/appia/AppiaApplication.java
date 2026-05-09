package com.appia;

import com.appia.model.*;
import com.appia.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import java.util.List;

/**
 * 🏛️ Appia — AI Digital Twin for Green Network Infrastructure
 * Phase 3: Enterprise Spring Boot Orchestration Backend
 */
@SpringBootApplication
@RequiredArgsConstructor
@Slf4j
@org.springframework.scheduling.annotation.EnableScheduling
public class AppiaApplication {

    public static void main(String[] args) {
        SpringApplication.run(AppiaApplication.class, args);
    }

    /** Seed the database with the 5 real Appia nodes, 8 SFCs, and 3 network slices on startup */
    @Bean
    CommandLineRunner seedDatabase(NetworkNodeRepository nodeRepo,
                                   ServiceFunctionChainRepository sfcRepo,
                                   com.appia.service.SliceOrchestrationService sliceService) {
        return args -> {
            if (nodeRepo.count() > 0) { log.info("Database already seeded."); return; }

            log.info("🏛️  Seeding Appia network topology...");

            // ── 5 Network Nodes ─────────────────────────────────────────────
            var oslo = nodeRepo.save(NetworkNode.builder()
                .nodeId("NO-OSLO-01").name("Oslo Edge Node").locationCode("NO")
                .nodeType(NetworkNode.NodeType.EDGE).status(NetworkNode.NodeStatus.ONLINE)
                .latitude(59.9139).longitude(10.7522)
                .cpuCapacityCores(64).memoryCapacityGb(256).maxBandwidthGbps(10)
                .processingLatencyMs(3.0).carbonIntensityGco2Kwh(25).energyCostEurKwh(0.04)
                .availablePowerKw(720).batteryLevelPct(80).hasRenewable(true).hasBattery(true)
                .build());

            var cph = nodeRepo.save(NetworkNode.builder()
                .nodeId("DK-CPH-01").name("Copenhagen Core").locationCode("DK")
                .nodeType(NetworkNode.NodeType.CORE).status(NetworkNode.NodeStatus.ONLINE)
                .latitude(55.6761).longitude(12.5683)
                .cpuCapacityCores(128).memoryCapacityGb(512).maxBandwidthGbps(40)
                .processingLatencyMs(2.0).carbonIntensityGco2Kwh(120).energyCostEurKwh(0.12)
                .availablePowerKw(1050).batteryLevelPct(90).hasRenewable(true).hasBattery(true)
                .build());

            var milan = nodeRepo.save(NetworkNode.builder()
                .nodeId("IT-MIL-01").name("Milan Data Center").locationCode("IT")
                .nodeType(NetworkNode.NodeType.DATA_CENTER).status(NetworkNode.NodeStatus.ONLINE)
                .latitude(45.4642).longitude(9.19)
                .cpuCapacityCores(256).memoryCapacityGb(1024).maxBandwidthGbps(100)
                .processingLatencyMs(1.5).carbonIntensityGco2Kwh(280).energyCostEurKwh(0.22)
                .availablePowerKw(1320).batteryLevelPct(70).hasRenewable(true).hasBattery(true)
                .build());

            var fra = nodeRepo.save(NetworkNode.builder()
                .nodeId("DE-FRA-01").name("Frankfurt Hub").locationCode("DE")
                .nodeType(NetworkNode.NodeType.DATA_CENTER).status(NetworkNode.NodeStatus.ONLINE)
                .latitude(50.1109).longitude(8.6821)
                .cpuCapacityCores(512).memoryCapacityGb(2048).maxBandwidthGbps(200)
                .processingLatencyMs(1.0).carbonIntensityGco2Kwh(320).energyCostEurKwh(0.18)
                .availablePowerKw(2400).batteryLevelPct(-1).hasRenewable(true).hasBattery(false)
                .build());

            var addis = nodeRepo.save(NetworkNode.builder()
                .nodeId("ET-ADD-01").name("Addis Ababa Edge").locationCode("ET")
                .nodeType(NetworkNode.NodeType.EDGE).status(NetworkNode.NodeStatus.ONLINE)
                .latitude(9.032).longitude(38.7469)
                .cpuCapacityCores(32).memoryCapacityGb(128).maxBandwidthGbps(2)
                .processingLatencyMs(15.0).carbonIntensityGco2Kwh(30).energyCostEurKwh(0.05)
                .availablePowerKw(280).batteryLevelPct(60).hasRenewable(true).hasBattery(true)
                .hasBackupGenerator(true)
                .build());

            // ── 8 Service Function Chains ────────────────────────────────────
            sfcRepo.saveAll(List.of(
                ServiceFunctionChain.builder()
                    .sfcId("SFC-BANK-01").name("Banking Core API").priority(ServiceFunctionChain.Priority.CRITICAL)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(cph)
                    .vnfChain(List.of(VnfType.FIREWALL, VnfType.LOAD_BALANCER, VnfType.API_GATEWAY))
                    .cpuRequiredCores(8).memoryRequiredGb(32).bandwidthRequiredGbps(1)
                    .maxLatencyMs(10).minAvailabilityPct(99.99).currentLatencyMs(2.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.CNF).k8sNamespace("banking").replicaCount(3)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-HEALTH-01").name("eHealth Emergency Comms").priority(ServiceFunctionChain.Priority.CRITICAL)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(oslo)
                    .vnfChain(List.of(VnfType.FIREWALL, VnfType.IDS_IPS, VnfType.SERVICE_MESH))
                    .cpuRequiredCores(4).memoryRequiredGb(16).bandwidthRequiredGbps(0.5)
                    .maxLatencyMs(5).minAvailabilityPct(99.99).currentLatencyMs(3.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.CNF).k8sNamespace("health").replicaCount(2)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-EMERG-01").name("Emergency Services Network").priority(ServiceFunctionChain.Priority.CRITICAL)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(oslo)
                    .vnfChain(List.of(VnfType.FIREWALL, VnfType.IDS_IPS))
                    .cpuRequiredCores(4).memoryRequiredGb(16).bandwidthRequiredGbps(0.5)
                    .maxLatencyMs(5).minAvailabilityPct(99.999).currentLatencyMs(3.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.VNF)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-CORP-01").name("Corporate VPN Gateway").priority(ServiceFunctionChain.Priority.MEDIUM)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(fra)
                    .vnfChain(List.of(VnfType.VPN_GATEWAY, VnfType.FIREWALL))
                    .cpuRequiredCores(6).memoryRequiredGb(24).bandwidthRequiredGbps(2)
                    .maxLatencyMs(50).minAvailabilityPct(99.9).currentLatencyMs(1.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.VNF)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-5G-UPF-01").name("5G User Plane Function").priority(ServiceFunctionChain.Priority.MEDIUM)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(cph)
                    .vnfChain(List.of(VnfType.UPF, VnfType.SMF, VnfType.NAT_GATEWAY))
                    .cpuRequiredCores(8).memoryRequiredGb(32).bandwidthRequiredGbps(5)
                    .maxLatencyMs(20).minAvailabilityPct(99.9).currentLatencyMs(2.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.CNF).k8sNamespace("5g-core").replicaCount(2)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-CDN-01").name("Content Delivery Network").priority(ServiceFunctionChain.Priority.MEDIUM)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(milan)
                    .vnfChain(List.of(VnfType.CDN_EDGE, VnfType.LOAD_BALANCER, VnfType.DNS_RESOLVER))
                    .cpuRequiredCores(8).memoryRequiredGb(32).bandwidthRequiredGbps(5)
                    .maxLatencyMs(80).minAvailabilityPct(99.9).currentLatencyMs(1.5)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.CNF).k8sNamespace("cdn").replicaCount(3)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-STREAM-01").name("Video Streaming").priority(ServiceFunctionChain.Priority.LOW)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(fra)
                    .vnfChain(List.of(VnfType.MEDIA_TRANSCODER, VnfType.CDN_EDGE, VnfType.LOAD_BALANCER))
                    .cpuRequiredCores(16).memoryRequiredGb(64).bandwidthRequiredGbps(10)
                    .maxLatencyMs(500).minAvailabilityPct(95.0).currentLatencyMs(1.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.CNF).k8sNamespace("streaming").replicaCount(4)
                    .build(),

                ServiceFunctionChain.builder()
                    .sfcId("SFC-SOCIAL-01").name("Social Media Cache").priority(ServiceFunctionChain.Priority.LOW)
                    .status(ServiceFunctionChain.SfcStatus.RUNNING).assignedNode(fra)
                    .vnfChain(List.of(VnfType.CDN_EDGE, VnfType.DNS_RESOLVER))
                    .cpuRequiredCores(12).memoryRequiredGb(48).bandwidthRequiredGbps(8)
                    .maxLatencyMs(300).minAvailabilityPct(95.0).currentLatencyMs(1.0)
                    .deploymentModel(ServiceFunctionChain.DeploymentModel.CNF).k8sNamespace("social").replicaCount(2)
                    .build()
            ));

            // Seed 3 standard 6G slices (URLLC / eMBB / mMTC)
            sliceService.seedSlices();

            log.info("✅ Appia seeded: {} nodes, {} SFCs, 3 network slices", nodeRepo.count(), sfcRepo.count());
            log.info("🏛️  Appia Backend running on http://localhost:8080");
            log.info("📖  API docs: http://localhost:8080/h2-console");
        };
    }
}
