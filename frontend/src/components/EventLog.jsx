/**
 * Appia — EventLog Component (Phase 6: Autonomous Event Agent)
 *
 * Live event log showing autonomous agent decisions:
 * - Cyber attacks → quarantine + migration
 * - Node failures → VNF recreation
 * - SLA breaches → latency-optimised migration
 * - Energy spikes → green workload migration
 * - Load spikes → scale out or shed
 *
 * Also includes a "Simulate Event" panel with preset buttons for live demos.
 */

import { useState, useEffect, useCallback } from "react";

// ── Event type config ────────────────────────────────────────────────────────
const EVENT_CONFIG = {
  CYBER_ATTACK:  { icon: "🚨", color: "#ef4444", label: "Cyber Attack"    },
  NODE_FAILURE:  { icon: "🔴", color: "#f97316", label: "Node Failure"    },
  SLA_BREACH:    { icon: "⚠️",  color: "#eab308", label: "SLA Breach"     },
  ENERGY_SPIKE:  { icon: "⚡", color: "#8b5cf6", label: "Energy Spike"    },
  LOAD_SPIKE:    { icon: "📈", color: "#3b82f6", label: "Load Spike"      },
  BATTERY_LOW:   { icon: "🔋", color: "#f97316", label: "Battery Low"     },
  NODE_RECOVERY: { icon: "✅", color: "#22c55e", label: "Node Recovery"   },
};

const SEVERITY_COLOR = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#eab308",
  LOW:      "#22c55e",
};

const STATUS_CONFIG = {
  DETECTED:   { label: "Detected",   bg: "#fef3c7", color: "#92400e" },
  RESPONDING: { label: "Responding", bg: "#dbeafe", color: "#1e40af" },
  RESOLVED:   { label: "Resolved",   bg: "#dcfce7", color: "#166534" },
  ESCALATED:  { label: "Escalated",  bg: "#fee2e2", color: "#991b1b" },
};

const ACTION_LABELS = {
  NONE:               "No action required",
  MIGRATE_SFC:        "SFC migrated to safer node",
  TERMINATE_VNF:      "VNF terminated (ETSI NFV)",
  RECREATE_VNF:       "VNF re-instantiated",
  SCALE_OUT_CNF:      "CNF scaled out (+1 replica)",
  QUARANTINE_NODE:    "Node quarantined",
  DEQUARANTINE_NODE:  "Node de-quarantined",
  SHED_LOW_PRIORITY:  "LOW priority SFC shed",
};

// ── Preset buttons for live demo ──────────────────────────────────────────────
const PRESETS = [
  { id: "cyber_milan",     label: "🚨 Cyber Attack Milan",    color: "#ef4444" },
  { id: "node_failure_de", label: "🔴 Node Failure Frankfurt",color: "#f97316" },
  { id: "energy_spike",    label: "⚡ Energy Spike DE",        color: "#8b5cf6" },
  { id: "sla_breach_bank", label: "⚠️  SLA Breach Banking",   color: "#eab308" },
  { id: "load_spike_oslo", label: "📈 Load Spike Oslo",        color: "#3b82f6" },
  { id: "battery_low_et",  label: "🔋 Battery Low Addis",     color: "#f97316" },
  { id: "recover_milan",   label: "✅ Recover Milan",          color: "#22c55e" },
];

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
}

function fmtLatency(ms) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── EventRow ─────────────────────────────────────────────────────────────────
function EventRow({ event, isNew }) {
  const [expanded, setExpanded] = useState(false);
  const cfg     = EVENT_CONFIG[event.eventType]   || { icon: "🔵", color: "#6b7280", label: event.eventType };
  const sevColor = SEVERITY_COLOR[event.severity] || "#6b7280";
  const statusCfg = STATUS_CONFIG[event.status]   || { label: event.status, bg: "#f3f4f6", color: "#374151" };

  return (
    <div
      style={{
        background: isNew ? "#fffbeb" : "#fff",
        border: `1px solid ${isNew ? "#fbbf24" : "#e5e7eb"}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 8,
        marginBottom: 8,
        overflow: "hidden",
        transition: "background 1s ease",
      }}
    >
      {/* Header row */}
      <div
        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 18 }}>{cfg.icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: cfg.color }}>{cfg.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 9999,
              background: sevColor + "22", color: sevColor,
            }}>{event.severity}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 9999,
              background: statusCfg.bg, color: statusCfg.color,
            }}>{statusCfg.label}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Node: <strong>{event.affectedNodeId}</strong>
            {event.affectedSfcId && <> · SFC: <strong>{event.affectedSfcId}</strong></>}
            {event.migratedToNodeId && (
              <> · Migrated→ <strong style={{ color: "#22c55e" }}>{event.migratedToNodeId}</strong></>
            )}
            <span style={{ marginLeft: 8, color: "#9ca3af" }}>{fmtTime(event.detectedAt)}</span>
          </div>
        </div>

        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {fmtLatency(event.responseLatencyMs)}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 14px", background: "#fafafa" }}>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
            <strong>Description:</strong> {event.description || "—"}
          </div>

          {(event.triggerValue != null) && (
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
              <strong>Trigger:</strong> {event.triggerValue?.toFixed(1)} (threshold: {event.triggerThreshold?.toFixed(1)})
            </div>
          )}

          <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
            <strong>Agent action:</strong>{" "}
            <span style={{ fontWeight: 600, color: cfg.color }}>
              {ACTION_LABELS[event.actionTaken] || event.actionTaken || "—"}
            </span>
          </div>

          {event.aiExplanation && (
            <div style={{
              fontSize: 12, color: "#1e40af",
              background: "#eff6ff", borderRadius: 6,
              padding: "8px 10px", marginTop: 6,
              borderLeft: "3px solid #3b82f6",
            }}>
              <strong>🤖 AI Incident Report (NIS2 Audit Trail):</strong>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {event.aiExplanation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main EventLog component ───────────────────────────────────────────────────
export default function EventLog({ isOnline }) {
  const [events, setEvents]         = useState([]);
  const [newIds, setNewIds]         = useState(new Set());
  const [loading, setLoading]       = useState(false);
  const [simulating, setSimulating] = useState(null);   // preset id being fired
  const [error, setError]           = useState(null);
  const [openCount, setOpenCount]   = useState(0);

  const fetchEvents = useCallback(async () => {
    if (!isOnline) return;
    try {
      const res = await fetch("/api/v1/events");
      if (!res.ok) return;
      const data = await res.json();

      setEvents(prev => {
        const prevIds = new Set(prev.map(e => e.id));
        const incoming = Array.isArray(data) ? data : [];
        const freshIds = new Set(incoming.filter(e => !prevIds.has(e.id)).map(e => e.id));
        if (freshIds.size > 0) {
          setNewIds(freshIds);
          setTimeout(() => setNewIds(new Set()), 3000);
        }
        return incoming;
      });
    } catch { /* backend may be restarting */ }
  }, [isOnline]);

  const fetchOpen = useCallback(async () => {
    if (!isOnline) return;
    try {
      const res = await fetch("/api/v1/events/open");
      if (res.ok) {
        const data = await res.json();
        setOpenCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  }, [isOnline]);

  // Poll every 4 seconds
  useEffect(() => {
    fetchEvents();
    fetchOpen();
    const id = setInterval(() => { fetchEvents(); fetchOpen(); }, 4000);
    return () => clearInterval(id);
  }, [fetchEvents, fetchOpen]);

  const triggerPreset = async (presetId) => {
    if (!isOnline) { setError("Backend offline — start Spring Boot first"); return; }
    setSimulating(presetId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/events/preset/${presetId}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Simulation failed");
      } else {
        await fetchEvents();
        await fetchOpen();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(null);
    }
  };

  return (
    <div style={{ padding: "0 4px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
            🤖 Autonomous Event Agent
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            ETSI ZSM closed-loop automation · NIS2/DORA incident log
          </p>
        </div>
        {openCount > 0 && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5",
            color: "#b91c1c", borderRadius: 8, padding: "6px 12px",
            fontSize: 13, fontWeight: 600,
          }}>
            ⚠️ {openCount} open incident{openCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ── Simulate panel ─────────────────────────────────────────────────── */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: 10, padding: "14px 16px", marginBottom: 20,
      }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>
          🎭 Simulate Event — Live Demo Controls
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => triggerPreset(p.id)}
              disabled={simulating !== null || !isOnline}
              style={{
                padding: "7px 13px",
                borderRadius: 8,
                border: `1px solid ${p.color}44`,
                background: simulating === p.id ? p.color : p.color + "15",
                color: simulating === p.id ? "#fff" : p.color,
                fontWeight: 600,
                fontSize: 12,
                cursor: simulating !== null || !isOnline ? "not-allowed" : "pointer",
                opacity: !isOnline ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {simulating === p.id ? "⏳ Running…" : p.label}
            </button>
          ))}
        </div>
        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>⚠️ {error}</div>
        )}
        {!isOnline && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Backend offline — start Spring Boot to enable simulations
          </div>
        )}
      </div>

      {/* ── Event log ──────────────────────────────────────────────────────── */}
      <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>
        📋 Event Log ({events.length} events)
      </div>

      {events.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 0",
          color: "#9ca3af", fontSize: 14,
          border: "2px dashed #e5e7eb", borderRadius: 10,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🟢</div>
          <div style={{ fontWeight: 600 }}>All systems nominal</div>
          <div style={{ marginTop: 4 }}>No events detected. Use the buttons above to simulate an incident.</div>
        </div>
      )}

      {events.map(event => (
        <EventRow
          key={event.id}
          event={event}
          isNew={newIds.has(event.id)}
        />
      ))}
    </div>
  );
}
