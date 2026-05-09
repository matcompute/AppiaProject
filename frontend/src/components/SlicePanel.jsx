/**
 * Appia — SlicePanel Component (Phase 9: Network Slicing)
 *
 * Visualises the 3 standard 6G network slices:
 *   URLLC — Critical Infrastructure (Banking, Emergency, eHealth)
 *   eMBB  — High Throughput (5G-UPF, CDN, Corporate)
 *   mMTC  — Best-Effort IoT (Streaming, Social)
 *
 * Shows per-slice: SLA compliance, latency, carbon, resource quotas,
 * admission control stats, and isolation status.
 *
 * 3GPP TS 28.541 · 3GPP TS 23.501 · ETSI NFV EVE 012 · O-RAN WG1
 */

import { useState, useEffect, useCallback } from "react";

// ── Slice type config ─────────────────────────────────────────────────────────
const SLICE_CONFIG = {
  URLLC: {
    color:     "#ef4444",
    bg:        "#fef2f2",
    border:    "#fca5a5",
    icon:      "⚡",
    label:     "URLLC",
    full:      "Ultra-Reliable Low Latency",
    standard:  "3GPP TS 23.501 §5.15.2",
    useCase:   "Banking · Emergency · eHealth",
    target:    "< 1ms · 99.9999% reliability",
  },
  eMBB: {
    color:     "#3b82f6",
    bg:        "#eff6ff",
    border:    "#93c5fd",
    icon:      "📡",
    label:     "eMBB",
    full:      "Enhanced Mobile Broadband",
    standard:  "3GPP TS 23.501 §5.15.2",
    useCase:   "5G-UPF · CDN · Corporate VPN",
    target:    "< 100ms · 20+ Gbps throughput",
  },
  mMTC: {
    color:     "#22c55e",
    bg:        "#f0fdf4",
    border:    "#86efac",
    icon:      "🌐",
    label:     "mMTC",
    full:      "massive Machine Type Comms",
    standard:  "3GPP TS 23.501 §5.15.2",
    useCase:   "Streaming · Social · IoT",
    target:    "Best-effort · 10⁶ devices/km²",
  },
};

const STATUS_CONFIG = {
  ACTIVE:     { label: "✓ Active",    color: "#166534", bg: "#dcfce7" },
  DEGRADED:   { label: "⚠ Degraded",  color: "#991b1b", bg: "#fee2e2" },
  SUSPENDED:  { label: "⏸ Suspended", color: "#6b7280", bg: "#f3f4f6" },
  TERMINATED: { label: "✕ Terminated",color: "#9ca3af", bg: "#f3f4f6" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: "#e5e7eb", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.min(100, score)}%`, background: color,
          borderRadius: 9999, transition: "width 0.5s ease",
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36 }}>
        {Math.round(score)}%
      </span>
    </div>
  );
}

function StatBox({ label, value, unit, color, sub }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      {unit && <div style={{ fontSize: 10, color: "#9ca3af" }}>{unit}</div>}
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}

// ── SliceCard ─────────────────────────────────────────────────────────────────
function SliceCard({ slice }) {
  const [expanded, setExpanded] = useState(true);
  const cfg    = SLICE_CONFIG[slice.sliceType]  || SLICE_CONFIG.eMBB;
  const stCfg  = STATUS_CONFIG[slice.status]    || STATUS_CONFIG.ACTIVE;

  const latencyOk  = slice.currentAvgLatencyMs <= slice.maxLatencyMs;
  const carbonOk   = slice.currentAvgCarbon    <= slice.maxCarbonGco2Kwh;
  const admitRate  = slice.admissionRequests > 0
    ? Math.round(slice.admissionGranted * 100 / slice.admissionRequests) : 100;

  return (
    <div style={{
      background: cfg.bg,
      border: `2px solid ${slice.status === "DEGRADED" ? "#ef4444" : cfg.border}`,
      borderRadius: 14, marginBottom: 16,
      boxShadow: slice.status === "DEGRADED" ? "0 0 0 3px #fee2e222" : "none",
    }}>
      {/* Header */}
      <div
        style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 28 }}>{cfg.icon}</span>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: cfg.color }}>{cfg.label}</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{slice.name}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 9999,
              background: stCfg.bg, color: stCfg.color,
            }}>{stCfg.label}</span>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            {cfg.full} · <span style={{ color: "#9ca3af" }}>{cfg.standard}</span>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Use cases: <strong>{cfg.useCase}</strong>
          </div>
        </div>

        {/* Compliance ring */}
        <div style={{ textAlign: "center", minWidth: 60 }}>
          <div style={{
            fontSize: 20, fontWeight: 800,
            color: slice.slaComplianceScore >= 90 ? "#22c55e"
                 : slice.slaComplianceScore >= 70 ? "#f59e0b" : "#ef4444",
          }}>{Math.round(slice.slaComplianceScore)}%</div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>SLA score</div>
        </div>

        <span style={{ fontSize: 14, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${cfg.border}`, padding: "14px 18px" }}>

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
            <StatBox
              label="Avg Latency" unit="ms"
              value={slice.currentAvgLatencyMs?.toFixed(1) ?? "—"}
              color={latencyOk ? "#22c55e" : "#ef4444"}
              sub={`SLA: ${slice.maxLatencyMs}ms`}
            />
            <StatBox
              label="Carbon" unit="gCO₂/kWh"
              value={Math.round(slice.currentAvgCarbon) || "—"}
              color={carbonOk ? "#22c55e" : "#ef4444"}
              sub={`Cap: ${slice.maxCarbonGco2Kwh}g`}
            />
            <StatBox
              label="Target Reliability"
              value={`${slice.targetReliabilityPct}%`}
              color={cfg.color}
              sub="Per 3GPP spec"
            />
            <StatBox
              label="CPU Quota"
              value={`${slice.guaranteedCpuCores}`} unit="cores"
              color="#6b7280"
            />
            <StatBox
              label="BW Quota"
              value={`${slice.guaranteedBandwidthGbps}`} unit="Gbps"
              color="#6b7280"
            />
          </div>

          {/* SLA compliance bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
              SLA Compliance Score
            </div>
            <ScoreBar score={slice.slaComplianceScore} color={cfg.color} />
          </div>

          {/* Admission control */}
          <div style={{
            background: "#fff", borderRadius: 8, padding: "10px 14px",
            border: "1px solid #e5e7eb", marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
              🎛️ Admission Control (3GPP Preemption Capability)
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
              <span>Total requests: <strong>{slice.admissionRequests}</strong></span>
              <span style={{ color: "#22c55e" }}>✓ Granted: <strong>{slice.admissionGranted}</strong></span>
              <span style={{ color: "#ef4444" }}>✕ Rejected: <strong>{slice.admissionRejected}</strong></span>
              <span style={{ color: cfg.color }}>Rate: <strong>{admitRate}%</strong></span>
            </div>
          </div>

          {/* Assigned SFCs */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              📦 Assigned SFCs ({slice.assignedSfcIds?.length ?? 0})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(slice.assignedSfcIds || []).map(sfcId => (
                <span key={sfcId} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 9999,
                  background: cfg.color + "18", color: cfg.color,
                  border: `1px solid ${cfg.color}33`,
                }}>{sfcId}</span>
              ))}
            </div>
          </div>

          {/* 6G target */}
          <div style={{ marginTop: 10, fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
            6G target: {cfg.target}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main SlicePanel ───────────────────────────────────────────────────────────
export default function SlicePanel({ isOnline }) {
  const [summary, setSummary] = useState(null);

  const fetchData = useCallback(async () => {
    if (!isOnline) return;
    try {
      const res = await fetch("/api/v1/slices/summary");
      if (res.ok) setSummary(await res.json());
    } catch {}
  }, [isOnline]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  const slices = summary?.slices || [];
  // Sort: URLLC first, then eMBB, then mMTC
  const order = { URLLC: 0, eMBB: 1, mMTC: 2 };
  const sorted = [...slices].sort((a, b) => (order[a.sliceType] ?? 3) - (order[b.sliceType] ?? 3));

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
          🍕 Network Slicing
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          3GPP TS 28.541 · 3GPP TS 23.501 §5.15 · ETSI NFV EVE 012 ·
          <span style={{ color: "#9ca3af" }}> O-RAN WG1 Slicing Architecture</span>
        </p>
      </div>

      {/* Summary strip */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Slices",    value: summary.totalSlices,   color: "#3b82f6" },
            { label: "Active",          value: summary.activeSlices,  color: "#22c55e" },
            { label: "Degraded",        value: summary.degradedSlices,color: summary.degradedSlices > 0 ? "#ef4444" : "#22c55e" },
            { label: "Avg Compliance",  value: `${summary.avgCompliance}%`, color: summary.avgCompliance >= 90 ? "#22c55e" : "#f59e0b" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 10, padding: "12px 16px", textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Isolation notice */}
      <div style={{
        background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
        padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#92400e",
      }}>
        <strong>⚡ Slice Isolation Active:</strong> URLLC slice has preemption priority over eMBB and mMTC.
        During resource pressure, mMTC workloads are shed to protect URLLC SLAs (3GPP TS 23.501 §5.7.2.2).
      </div>

      {/* Slice cards */}
      {sorted.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 14,
          border: "2px dashed #e5e7eb", borderRadius: 10,
        }}>
          <div style={{ fontSize: 36 }}>🍕</div>
          <div style={{ fontWeight: 600 }}>No slices found</div>
          <div>Start Spring Boot to seed the 3 standard 6G slices</div>
        </div>
      )}

      {sorted.map(slice => <SliceCard key={slice.sliceId} slice={slice} />)}

      {/* Roadmap */}
      <div style={{
        marginTop: 8, padding: "12px 16px",
        background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: 10, fontSize: 12, color: "#6b7280",
      }}>
        <strong style={{ color: "#374151" }}>🗺️ O-RAN Roadmap:</strong>{" "}
        Each slice maps to an O-RAN <strong>Network Slice Subnet Instance (NSSI)</strong>.
        The Near-RT RIC allocates Physical Resource Blocks (PRBs) per slice via the <strong>E2 interface</strong>.
        Appia's slice orchestrator becomes the <strong>xApp</strong> controlling RAN slicing via <strong>A1 policy</strong>.
        Testbed: Open5GS (5GC) + UeRansim (gNB/UE) + O-RAN SC Near-RT RIC.
      </div>
    </div>
  );
}
