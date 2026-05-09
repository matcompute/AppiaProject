/**
 * Appia — ResiliencePanel Component (Phase 8: Resilience & Self-Healing)
 *
 * 6G KPI Dashboard showing:
 *  - Network availability (targeting five nines: 99.999%)
 *  - MTTR — Mean Time To Recovery (target: < 200ms)
 *  - Per-SFC health, active/standby topology
 *  - One-click SFC failure simulation → watch HEAL fire live
 *
 * ITU-R IMT-2030 (6G) · ETSI NFV HEAL · O-RAN NearRT-RIC xApp roadmap
 */

import { useState, useEffect, useCallback } from "react";

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORITY_COLOR = { CRITICAL: "#ef4444", MEDIUM: "#f59e0b", LOW: "#6b7280" };
const STATUS_COLOR   = { RUNNING: "#22c55e", DEGRADED: "#f59e0b", SHED: "#9ca3af",
                          MIGRATING: "#3b82f6", OFFLINE: "#ef4444" };

const NINES_COLOR = (n) => {
  if (n?.includes("Five") || n?.includes("Six") || n?.includes("Seven")) return "#22c55e";
  if (n?.includes("Four")) return "#f59e0b";
  return "#ef4444";
};

const AVAIL_COLOR = (pct) => pct >= 99.99 ? "#22c55e" : pct >= 99.9 ? "#f59e0b" : "#ef4444";

// ── 6G Status badge ───────────────────────────────────────────────────────────
function SixGBadge({ status }) {
  const cfg = {
    "6G_READY":       { bg: "#dcfce7", color: "#166534", label: "⚡ 6G Ready"         },
    "5G_COMPLIANT":   { bg: "#dbeafe", color: "#1e40af", label: "✓ 5G Compliant"      },
    "BELOW_TARGET":   { bg: "#fee2e2", color: "#991b1b", label: "⚠ Below Target"      },
  }[status] || { bg: "#f3f4f6", color: "#6b7280", label: status };

  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 9999,
      background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

// ── Gauge bar ─────────────────────────────────────────────────────────────────
function GaugeBar({ value, max, color, label, unit = "%" }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: "#6b7280" }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value?.toFixed?.(1) ?? value}{unit}</span>
      </div>
      <div style={{ height: 6, background: "#e5e7eb", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: 9999, transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

// ── SFC Health Row ────────────────────────────────────────────────────────────
function SfcHealthRow({ sfc, onSimulateFailure, simulating }) {
  const priColor   = PRIORITY_COLOR[sfc.priority]   || "#6b7280";
  const statColor  = STATUS_COLOR[sfc.status]       || "#6b7280";
  const availColor = AVAIL_COLOR(sfc.availabilityPct);
  const ninesColor = NINES_COLOR(sfc.nines);

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb",
      borderLeft: `4px solid ${priColor}`,
      borderRadius: 8, padding: "10px 14px", marginBottom: 8,
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      {/* SFC identity */}
      <div style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#111827" }}>{sfc.sfcId}</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{sfc.name}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 9999,
            background: priColor + "20", color: priColor }}>{sfc.priority}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 9999,
            background: statColor + "20", color: statColor }}>{sfc.status}</span>
        </div>
      </div>

      {/* Placement */}
      <div style={{ minWidth: 130, fontSize: 11 }}>
        <div style={{ color: "#6b7280" }}>Active node</div>
        <div style={{ fontWeight: 700, color: "#111827" }}>{sfc.assignedNode}</div>
        <div style={{ color: "#9ca3af", marginTop: 2 }}>
          Standby: <span style={{ color: sfc.hasStandby ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
            {sfc.standbyNode !== "NONE" ? sfc.standbyNode : "⚠ None"}
          </span>
        </div>
      </div>

      {/* Latency */}
      <div style={{ minWidth: 90, fontSize: 11 }}>
        <div style={{ color: "#6b7280" }}>Latency</div>
        <div style={{ fontWeight: 700, color: sfc.slaOk ? "#22c55e" : "#ef4444", fontSize: 14 }}>
          {sfc.avgLatencyMs?.toFixed?.(1) ?? sfc.avgLatencyMs}ms
        </div>
        <div style={{ color: "#9ca3af" }}>SLA: {sfc.slaLatencyMs}ms</div>
      </div>

      {/* Availability */}
      <div style={{ minWidth: 110, fontSize: 11 }}>
        <div style={{ color: "#6b7280" }}>Availability</div>
        <div style={{ fontWeight: 700, color: availColor, fontSize: 14 }}>
          {sfc.availabilityPct?.toFixed(3)}%
        </div>
        <div style={{ fontWeight: 600, fontSize: 10, color: ninesColor }}>{sfc.nines}</div>
      </div>

      {/* Reliability */}
      <div style={{ minWidth: 90, fontSize: 11 }}>
        <div style={{ color: "#6b7280" }}>Reliability</div>
        <div style={{ fontWeight: 700, color: "#3b82f6", fontSize: 14 }}>
          {sfc.reliabilityPct?.toFixed(3)}%
        </div>
        <div style={{ color: "#9ca3af" }}>N+1 redundancy</div>
      </div>

      {/* SLA violations */}
      {sfc.violationCount > 0 && (
        <div style={{ minWidth: 70, fontSize: 11 }}>
          <div style={{ color: "#6b7280" }}>Violations</div>
          <div style={{ fontWeight: 700, color: "#ef4444" }}>{sfc.violationCount}</div>
        </div>
      )}

      {/* Simulate failure button */}
      <div style={{ marginLeft: "auto" }}>
        <button
          onClick={() => onSimulateFailure(sfc.sfcId)}
          disabled={simulating === sfc.sfcId}
          style={{
            padding: "6px 12px", borderRadius: 7,
            border: "1px solid #fca5a540",
            background: simulating === sfc.sfcId ? "#ef4444" : "#fef2f2",
            color: simulating === sfc.sfcId ? "#fff" : "#b91c1c",
            fontWeight: 600, fontSize: 11, cursor: simulating ? "not-allowed" : "pointer",
          }}
        >
          {simulating === sfc.sfcId ? "⏳ Healing…" : "💥 Simulate Failure"}
        </button>
      </div>
    </div>
  );
}

// ── Main ResiliencePanel ──────────────────────────────────────────────────────
export default function ResiliencePanel({ isOnline }) {
  const [kpis, setKpis]             = useState(null);
  const [simulating, setSimulating] = useState(null);
  const [healResult, setHealResult] = useState(null);
  const [error, setError]           = useState(null);

  const fetchKpis = useCallback(async () => {
    if (!isOnline) return;
    try {
      const res = await fetch("/api/v1/resilience/kpis");
      if (res.ok) setKpis(await res.json());
    } catch {}
  }, [isOnline]);

  useEffect(() => {
    fetchKpis();
    const id = setInterval(fetchKpis, 5000);
    return () => clearInterval(id);
  }, [fetchKpis]);

  const simulateFailure = async (sfcId) => {
    if (!isOnline) return;
    setSimulating(sfcId);
    setHealResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/resilience/simulate-failure/${sfcId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setHealResult({ sfcId, ...data });
        await fetchKpis();
      } else {
        setError(data.error || "Simulation failed");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(null);
    }
  };

  const sfcList = kpis?.sfcs || [];
  const criticalSfcs = sfcList.filter(s => s.priority === "CRITICAL");
  const otherSfcs    = sfcList.filter(s => s.priority !== "CRITICAL");

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
            🛡️ Resilience & Self-Healing
          </h2>
          {kpis && <SixGBadge status={kpis.overall6gStatus} />}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          ETSI NFV HEAL · Active/Standby N+1 · 6G KPIs (ITU-R IMT-2030) ·
          <span style={{ color: "#9ca3af" }}> Roadmap: O-RAN xApp → Open5GS + UeRansim</span>
        </p>
      </div>

      {/* ── 6G KPI strip ────────────────────────────────────────────────── */}
      {kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            {
              label: "Network Availability",
              value: `${kpis.networkAvailabilityPct?.toFixed(3)}%`,
              sub:   kpis.meetsAvailabilityTarget ? "✓ On target" : "⚠ Below 99.999%",
              color: kpis.meetsAvailabilityTarget ? "#22c55e" : "#ef4444",
            },
            {
              label: "Avg MTTR",
              value: kpis.avgMttrMs > 0 ? `${kpis.avgMttrMs}ms` : "—",
              sub:   kpis.meetsMttrTarget ? `✓ < ${kpis.targetMttrMs}ms target` : "⚠ Above target",
              color: kpis.meetsMttrTarget ? "#22c55e" : "#ef4444",
            },
            {
              label: "Heals (last hour)",
              value: kpis.healsLastHour,
              sub:   "ETSI NFV HEAL ops",
              color: kpis.healsLastHour === 0 ? "#22c55e" : "#f59e0b",
            },
            {
              label: "SLA Breaches / hr",
              value: kpis.slaBreachesLastHour,
              sub:   kpis.slaBreachesLastHour === 0 ? "✓ No breaches" : "⚠ SLA at risk",
              color: kpis.slaBreachesLastHour === 0 ? "#22c55e" : "#ef4444",
            },
            {
              label: "Latency SLA",
              value: kpis.meetsLatencyTarget ? "✓ MET" : "⚠ BREACHED",
              sub:   "All SFCs within limit",
              color: kpis.meetsLatencyTarget ? "#22c55e" : "#ef4444",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{
              background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase",
                letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Heal result panel ────────────────────────────────────────────── */}
      {healResult && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #86efac",
          borderRadius: 10, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, color: "#166534", marginBottom: 6 }}>
            ✅ HEAL Complete — {healResult.sfcId}
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#374151", flexWrap: "wrap" }}>
            <span>Action: <strong>{healResult.healAction?.replace(/_/g," ")}</strong></span>
            <span>Migrated to: <strong style={{ color: "#22c55e" }}>{healResult.migratedTo}</strong></span>
            <span>Response time: <strong style={{ color: "#22c55e" }}>{healResult.responseMs}ms</strong></span>
            <span>Status: <strong>{healResult.status}</strong></span>
          </div>
          {healResult.aiReport && (
            <div style={{
              marginTop: 10, fontSize: 12, color: "#1e40af",
              background: "#eff6ff", borderRadius: 6, padding: "8px 10px",
              borderLeft: "3px solid #3b82f6",
            }}>
              <strong>🤖 AI Incident Report:</strong>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {healResult.aiReport}
              </div>
            </div>
          )}
          <button
            onClick={() => setHealResult(null)}
            style={{ marginTop: 8, fontSize: 11, color: "#6b7280",
              background: "none", border: "none", cursor: "pointer" }}
          >✕ Dismiss</button>
        </div>
      )}

      {error && (
        <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>⚠️ {error}</div>
      )}

      {/* ── CRITICAL SFCs ────────────────────────────────────────────────── */}
      {criticalSfcs.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 8 }}>
            🔴 Critical Services
            <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>
              — Active/Standby N+1 redundancy enforced
            </span>
          </div>
          {criticalSfcs.map(sfc => (
            <SfcHealthRow key={sfc.sfcId} sfc={sfc}
              onSimulateFailure={simulateFailure}
              simulating={simulating} />
          ))}
        </>
      )}

      {/* ── Other SFCs ───────────────────────────────────────────────────── */}
      {otherSfcs.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#374151",
            marginTop: 16, marginBottom: 8 }}>
            ◉ Standard Services
          </div>
          {otherSfcs.map(sfc => (
            <SfcHealthRow key={sfc.sfcId} sfc={sfc}
              onSimulateFailure={simulateFailure}
              simulating={simulating} />
          ))}
        </>
      )}

      {/* ── Roadmap note ─────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 24, padding: "12px 16px",
        background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: 10, fontSize: 12, color: "#6b7280",
      }}>
        <strong style={{ color: "#374151" }}>🗺️ Testbed Roadmap:</strong>{" "}
        Next step — connect Appia to{" "}
        <strong>Open5GS</strong> (5G core: AMF/SMF/UPF) +{" "}
        <strong>UeRansim</strong> (gNB + UE simulator) +{" "}
        <strong>O-RAN Near-RT RIC</strong> (Appia becomes an xApp via E2/A1 interfaces).
        Health checks will use real E2 telemetry. HEAL actions will control real VNFs.
        Carbon data from real power meters on gNB hardware.
        Target: IEEE/ACM best paper — "AI-Driven Green Orchestration for 6G Networks."
      </div>

      {!isOnline && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 14,
          border: "2px dashed #e5e7eb", borderRadius: 10, marginTop: 16 }}>
          <div style={{ fontSize: 36 }}>🛡️</div>
          <div style={{ fontWeight: 600 }}>Backend offline</div>
          <div>Start Spring Boot to enable the resilience engine</div>
        </div>
      )}
    </div>
  );
}
