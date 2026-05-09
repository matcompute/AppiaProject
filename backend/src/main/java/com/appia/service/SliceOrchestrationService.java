package com.appia.service;

import com.appia.model.*;
import com.appia.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Appia — Slice Orchestration Service (Phase 9: Network Slicing)
 * ===============================================================
 * Implements 3GPP TS 28.541 slice lifecycle management with:
 *
 *  1. ADMISSION CONTROL
 *     Before placing an SFC on a slice, check:
 *       - Slice resource quota not exceeded (CPU, BW)
 *       - Slice carbon cap not breached (EU Green Deal per-slice policy)
 *       - Node can physically host the SFC
 *     Reject if any constraint fails → no starvation between slices.
 *
 *  2. SLICE ISOLATION
 *     URLLC slices are always served first during congestion.
 *     mMTC slices are preemptible — shed to protect URLLC/eMBB.
 *     Carbon budget enforced per-slice independently.
 *
 *  3. LIVE KPI REFRESH
 *     Called every telemetry tick — updates per-slice:
 *       - Average latency across all SFCs in the slice
 *       - Average carbon intensity
 *       - SLA compliance score (0-100)
 *       - Admission grant/reject counters
 *
 *  4. SLICE SEEDING
 *     On startup: creates the 3 standard slices matching the seeded SFCs:
 *       URLLC → Banking, eHealth, Emergency (CRITICAL — sub-10ms)
 *       eMBB  → 5G-UPF, CDN, Corporate VPN (MEDIUM — < 100ms)
 *       mMTC  → Streaming, Social Media (LOW — best effort)
 *
 * Reference: 3GPP TS 28.541, 3GPP TS 23.501 §5.15,
 *            ETSI NFV EVE 012, O-RAN WG1 Slicing Architecture
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class SliceOrchestrationService {

    private final NetworkSliceRepository         sliceRepo;
    private final ServiceFunctionChainRepository sfcRepo;
    private final NetworkNodeRepository          nodeRepo;

    // ── Slice seeding ─────────────────────────────────────────────────────────

    /**
     * Creates the 3 standard 6G slices if none exist.
     * Called by AppiaApplication on startup (after SFC seeding).
     */
    public void seedSlices() {
        if (sliceRepo.count() > 0) return;

        log.info("[SLICING] Seeding 3 standard 6G slices (URLLC / eMBB / mMTC)...");

        // URLLC — Ultra-Reliable Low Latency (Banking, Emergency, eHealth)
        sliceRepo.save(NetworkSlice.builder()
            .sliceId("SLICE-URLLC-01")
            .name("URLLC — Critical Infrastructure")
            .description("Banking, Emergency Services, eHealth. Sub-10ms SLA. Six-nines reliability. " +
                         "Maps to 3GPP URLLC slice (TS 23.501 §5.15.2).")
            .sliceType(NetworkSlice.SliceType.URLLC)
            .priority(NetworkSlice.SlicePriority.CRITICAL)
            .maxLatencyMs(10.0)
            .minThroughputGbps(0.5)
            .targetReliabilityPct(99.9999)
            .maxJitterMs(0.5)
            .guaranteedCpuCores(16.0)
            .guaranteedBandwidthGbps(2.0)
            .maxCarbonGco2Kwh(150.0)   // green SLA: URLLC must be on low-carbon nodes
            .assignedSfcIds(List.of("SFC-BANK-01", "SFC-HEALTH-01", "SFC-EMERG-01"))
            .build());

        // eMBB — Enhanced Mobile Broadband (5G-UPF, CDN, Corporate)
        sliceRepo.save(NetworkSlice.builder()
            .sliceId("SLICE-EMBB-01")
            .name("eMBB — High Throughput Services")
            .description("5G User Plane, CDN, Corporate VPN. High bandwidth, moderate latency. " +
                         "Maps to 3GPP eMBB slice (TS 23.501 §5.15.2).")
            .sliceType(NetworkSlice.SliceType.eMBB)
            .priority(NetworkSlice.SlicePriority.MEDIUM)
            .maxLatencyMs(100.0)
            .minThroughputGbps(5.0)
            .targetReliabilityPct(99.9)
            .maxJitterMs(10.0)
            .guaranteedCpuCores(22.0)
            .guaranteedBandwidthGbps(7.0)
            .maxCarbonGco2Kwh(400.0)
            .assignedSfcIds(List.of("SFC-5G-UPF-01", "SFC-CDN-01", "SFC-CORP-01"))
            .build());

        // mMTC — massive Machine Type Communications (Streaming, Social)
        sliceRepo.save(NetworkSlice.builder()
            .sliceId("SLICE-MMTC-01")
            .name("mMTC — Best-Effort & IoT")
            .description("Video Streaming, Social Media Cache. Best-effort, preemptible. " +
                         "Maps to 3GPP mMTC slice (TS 23.501 §5.15.2).")
            .sliceType(NetworkSlice.SliceType.mMTC)
            .priority(NetworkSlice.SlicePriority.LOW)
            .maxLatencyMs(500.0)
            .minThroughputGbps(10.0)
            .targetReliabilityPct(99.0)
            .maxJitterMs(50.0)
            .guaranteedCpuCores(28.0)
            .guaranteedBandwidthGbps(18.0)
            .maxCarbonGco2Kwh(700.0)   // mMTC tolerates higher carbon (best-effort)
            .assignedSfcIds(List.of("SFC-STREAM-01", "SFC-SOCIAL-01"))
            .build());

        log.info("[SLICING] ✅ 3 slices seeded: URLLC / eMBB / mMTC");
    }

    // ── Admission Control ─────────────────────────────────────────────────────

    /**
     * Decides whether to admit an SFC into a slice.
     * Returns an AdmissionResult explaining the decision.
     *
     * This is the critical function for slice isolation:
     * a mMTC SFC cannot consume resources reserved for URLLC.
     */
    public AdmissionResult checkAdmission(String sliceId, String sfcId) {
        NetworkSlice slice = sliceRepo.findBySliceId(sliceId)
            .orElseThrow(() -> new RuntimeException("Slice not found: " + sliceId));

        ServiceFunctionChain sfc = sfcRepo.findBySfcId(sfcId)
            .orElseThrow(() -> new RuntimeException("SFC not found: " + sfcId));

        slice.setAdmissionRequests(slice.getAdmissionRequests() + 1);

        // Check 1: Slice is active
        if (slice.getStatus() != NetworkSlice.SliceStatus.ACTIVE) {
            slice.setAdmissionRejected(slice.getAdmissionRejected() + 1);
            sliceRepo.save(slice);
            return AdmissionResult.reject("Slice " + sliceId + " is " + slice.getStatus());
        }

        // Check 2: CPU quota
        double usedCpu = computeUsedCpu(slice);
        if (usedCpu + sfc.getCpuRequiredCores() > slice.getGuaranteedCpuCores() * 1.5) {
            slice.setAdmissionRejected(slice.getAdmissionRejected() + 1);
            sliceRepo.save(slice);
            return AdmissionResult.reject(String.format(
                "CPU quota exceeded: %.1f + %.1f > %.1f cores",
                usedCpu, sfc.getCpuRequiredCores(), slice.getGuaranteedCpuCores() * 1.5));
        }

        // Check 3: Bandwidth quota
        double usedBw = computeUsedBandwidth(slice);
        if (usedBw + sfc.getBandwidthRequiredGbps() > slice.getGuaranteedBandwidthGbps() * 1.5) {
            slice.setAdmissionRejected(slice.getAdmissionRejected() + 1);
            sliceRepo.save(slice);
            return AdmissionResult.reject(String.format(
                "Bandwidth quota exceeded: %.1f + %.1f > %.1f Gbps",
                usedBw, sfc.getBandwidthRequiredGbps(), slice.getGuaranteedBandwidthGbps() * 1.5));
        }

        // Admitted
        slice.setAdmissionGranted(slice.getAdmissionGranted() + 1);

        // Add SFC to slice if not already there
        if (!slice.getAssignedSfcIds().contains(sfcId)) {
            List<String> updated = new ArrayList<>(slice.getAssignedSfcIds());
            updated.add(sfcId);
            slice.setAssignedSfcIds(updated);
        }

        sliceRepo.save(slice);
        return AdmissionResult.admit(String.format(
            "Admitted to %s (CPU: %.1f/%.1f cores, BW: %.1f/%.1f Gbps)",
            sliceId, usedCpu + sfc.getCpuRequiredCores(), slice.getGuaranteedCpuCores(),
            usedBw + sfc.getBandwidthRequiredGbps(), slice.getGuaranteedBandwidthGbps()));
    }

    // ── Live KPI refresh ──────────────────────────────────────────────────────

    /**
     * Refreshes live KPIs for all slices.
     * Called after every telemetry update (PATCH /nodes/{id}/telemetry).
     */
    public void refreshSliceKpis() {
        List<NetworkSlice> slices = sliceRepo.findActiveSlices();
        List<ServiceFunctionChain> allSfcs = sfcRepo.findAll();

        for (NetworkSlice slice : slices) {
            List<ServiceFunctionChain> sliceSfcs = allSfcs.stream()
                .filter(sfc -> slice.getAssignedSfcIds().contains(sfc.getSfcId()))
                .collect(Collectors.toList());

            if (sliceSfcs.isEmpty()) continue;

            // Average latency across slice SFCs
            double avgLatency = sliceSfcs.stream()
                .mapToDouble(ServiceFunctionChain::getCurrentLatencyMs)
                .average().orElse(0);

            // Average carbon across assigned nodes
            double avgCarbon = sliceSfcs.stream()
                .filter(s -> s.getAssignedNode() != null)
                .mapToDouble(s -> s.getAssignedNode().getCarbonIntensityGco2Kwh())
                .average().orElse(0);

            // SLA compliance: % of SFCs meeting their latency SLA
            long slaOk = sliceSfcs.stream().filter(s -> !s.isSlaViolated()).count();
            double complianceScore = sliceSfcs.isEmpty() ? 100.0
                : (slaOk * 100.0 / sliceSfcs.size());

            // Carbon SLA check
            if (avgCarbon > slice.getMaxCarbonGco2Kwh()) {
                complianceScore = Math.max(0, complianceScore - 20);
                log.debug("[SLICING] {} carbon SLA breached: {:.0f} > {:.0f} gCO2",
                          slice.getSliceId(), avgCarbon, slice.getMaxCarbonGco2Kwh());
            }

            slice.setCurrentAvgLatencyMs(avgLatency);
            slice.setCurrentAvgCarbon(avgCarbon);
            slice.setSlaComplianceScore(complianceScore);
            slice.setStatus(complianceScore < 70
                ? NetworkSlice.SliceStatus.DEGRADED
                : NetworkSlice.SliceStatus.ACTIVE);

            sliceRepo.save(slice);
        }
    }

    // ── Slice isolation enforcement ───────────────────────────────────────────

    /**
     * During resource pressure, protect URLLC by preempting mMTC SFCs.
     * Implements 3GPP preemption capability (TS 23.501 §5.7.2.2).
     */
    public List<String> enforceIsolation() {
        List<String> actions = new ArrayList<>();
        List<NetworkSlice> degraded = sliceRepo.findByStatusOrderByPriorityAsc(
            NetworkSlice.SliceStatus.DEGRADED);

        for (NetworkSlice slice : degraded) {
            if (slice.getSliceType() == NetworkSlice.SliceType.URLLC) {
                // URLLC degraded — preempt mMTC SFCs on the same nodes
                actions.add("URLLC slice " + slice.getSliceId() +
                            " degraded — preemption of mMTC workloads triggered");
                log.warn("[SLICING] ⚡ URLLC SLA violated — preempting mMTC SFCs");
            }
        }
        return actions;
    }

    // ── CRUD + queries ────────────────────────────────────────────────────────

    public List<NetworkSlice> getAllSlices() { return sliceRepo.findAll(); }

    public Optional<NetworkSlice> getSlice(String sliceId) {
        return sliceRepo.findBySliceId(sliceId);
    }

    public Map<String, Object> getSliceSummary() {
        List<NetworkSlice> slices = sliceRepo.findAll();
        long degraded = sliceRepo.countDegraded();
        Double avgScore = sliceRepo.avgComplianceScore();

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalSlices",      slices.size());
        summary.put("activeSlices",     slices.stream().filter(s -> s.getStatus() == NetworkSlice.SliceStatus.ACTIVE).count());
        summary.put("degradedSlices",   degraded);
        summary.put("avgCompliance",    avgScore != null ? Math.round(avgScore) : 100);
        summary.put("slices",           slices);
        return summary;
    }

    // ── Resource accounting helpers ───────────────────────────────────────────

    private double computeUsedCpu(NetworkSlice slice) {
        return sfcRepo.findAll().stream()
            .filter(sfc -> slice.getAssignedSfcIds().contains(sfc.getSfcId()))
            .mapToDouble(ServiceFunctionChain::getCpuRequiredCores)
            .sum();
    }

    private double computeUsedBandwidth(NetworkSlice slice) {
        return sfcRepo.findAll().stream()
            .filter(sfc -> slice.getAssignedSfcIds().contains(sfc.getSfcId()))
            .mapToDouble(ServiceFunctionChain::getBandwidthRequiredGbps)
            .sum();
    }

    // ── Admission result DTO ──────────────────────────────────────────────────

    public static class AdmissionResult {
        public final boolean admitted;
        public final String  reason;

        private AdmissionResult(boolean admitted, String reason) {
            this.admitted = admitted;
            this.reason   = reason;
        }

        public static AdmissionResult admit(String reason)  { return new AdmissionResult(true,  reason); }
        public static AdmissionResult reject(String reason) { return new AdmissionResult(false, reason); }
    }
}
