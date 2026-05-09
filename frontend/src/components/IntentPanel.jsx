/**
 * Appia — IntentPanel Component (Phase 7: Intent-Based Networking)
 *
 * Operators express high-level goals in natural language.
 * Gemini parses them into enforceable policies.
 * The system continuously validates and auto-remediates violations.
 *
 * "Keep Banking SFC below 100 gCO2/kWh" → parsed → enforced → violations → auto-migrated
 */

import { useState, useEffect, useCallback } from "react";

// ── Config ────────────────────────────────────────────────────────────────────

const POLICY_CONFIG = {
  CARBON_LIMIT:      { icon: "🌿", color: "#22c55e", label: "Carbon Limit"      },
  ENERGY_COST_LIMIT: { icon: "💰", color: "#3b82f6", label: "Energy Cost Limit" },
  LATENCY_SLA:       { icon: "⚡", color: "#f59e0b", label: "Latency SLA"       },
  CPU_LOAD_LIMIT:    { icon: "📊", color: "#8b5cf6", label: "CPU Load Limit"    },
  SLA_PRIORITY:      { icon: "🎯", color: "#ec4899", label: "SLA Priority"      },
  NODE_EXCLUSION:    { icon: "🚫", color: "#ef4444", label: "Node Exclusion"    },
  GREEN_PREFERENCE:  { icon: "♻️", color: "#22c55e", label: "Green Preference"  },
  UNKNOWN:           { icon: "❓", color: "#9ca3af", label: "Unrecognised"      },
};

const STATUS_CONFIG = {
  ACTIVE:    { label: "Active",     bg: "#dbeafe", color: "#1e40af" },
  SATISFIED: { label: "✓ Compliant", bg: "#dcfce7", color: "#166534" },
  VIOLATED:  { label: "⚠ Violated",  bg: "#fee2e2", color: "#991b1b" },
  PAUSED:    { label: "Paused",     bg: "#f3f4f6", color: "#6b7280" },
  EXPIRED:   { label: "Expired",   bg: "#f3f4f6", color: "#9ca3af" },
};

// Example intents shown as suggestions
const EXAMPLE_INTENTS = [
  "Keep Banking SFC carbon intensity below 100 gCO2/kWh at all times",
  "Never let any node exceed 85% CPU load",
  "Guarantee Emergency services latency under 5ms",
  "Prefer renewable-powered nodes for all CRITICAL services",
  "Keep energy cost below €0.10/kWh for streaming services",
  "Never place any SFC on the Frankfurt node",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ComplianceRing({ score }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = circ * (score / 100);
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={70} height={70} viewBox="0 0 70 70">
      <circle cx={35} cy={35} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
      <circle
        cx={35} cy={35} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        transform="rotate(-90 35 35)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x={35} y={39} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>
        {Math.round(score)}%
      </text>
    </svg>
  );
}

// ── IntentCard ────────────────────────────────────────────────────────────────

function IntentCard({ intent, onPause, onResume, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const cfg    = POLICY_CONFIG[intent.policyType] || POLICY_CONFIG.UNKNOWN;
  const stCfg  = STATUS_CONFIG[intent.status]     || STATUS_CONFIG.ACTIVE;

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${intent.status === "VIOLATED" ? "#fca5a5" : "#e5e7eb"}`,
      borderLeft: `4px solid ${cfg.color}`,
      borderRadius: 10,
      marginBottom: 10,
      overflow: "hidden",
      boxShadow: intent.status === "VIOLATED" ? "0 0 0 2px #fee2e2" : "none",
    }}>
      {/* Header */}
      <div
        style={{ padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 20, lineHeight: 1.2 }}>{cfg.icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: cfg.color }}>{cfg.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 9999,
              background: stCfg.bg, color: stCfg.color,
            }}>{stCfg.label}</span>
            {intent.violationCount > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 9999,
                background: "#fef2f2", color: "#b91c1c",
              }}>{intent.violationCount} violation{intent.violationCount !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.4 }}>
            "{intent.naturalLanguageIntent}"
          </div>
          {intent.targetEntity && intent.thresholdValue != null && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
              Target: <strong>{intent.targetEntity}</strong> ·{" "}
              Threshold: <strong style={{ color: cfg.color }}>
                {intent.direction === "BELOW" ? "< " : intent.direction === "ABOVE" ? "> " : ""}
                {intent.thresholdValue} {intent.thresholdUnit}
              </strong>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ComplianceRing score={intent.complianceScore ?? 100} />
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 14px", background: "#fafafa" }}>
          {intent.parsedExplanation && (
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
              <strong>🤖 Gemini interpretation:</strong> {intent.parsedExplanation}
            </div>
          )}

          {intent.lastEnforcementAction && (
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
              <strong>Last action:</strong> {intent.lastEnforcementAction}
            </div>
          )}

          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>
            Created: {fmtTime(intent.createdAt)}
            {intent.lastCheckedAt && <> · Checked: {fmtTime(intent.lastCheckedAt)}</>}
            {intent.lastViolatedAt && <> · Last violation: {fmtTime(intent.lastViolatedAt)}</>}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {intent.status === "PAUSED" ? (
              <button onClick={() => onResume(intent.id)} style={btnStyle("#22c55e")}>▶ Resume</button>
            ) : (
              <button onClick={() => onPause(intent.id)} style={btnStyle("#6b7280")}>⏸ Pause</button>
            )}
            <button onClick={() => onDelete(intent.id)} style={btnStyle("#ef4444")}>✕ Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(color) {
  return {
    padding: "5px 12px", borderRadius: 6, border: `1px solid ${color}44`,
    background: color + "15", color, fontWeight: 600, fontSize: 12, cursor: "pointer",
  };
}

// ── Main IntentPanel ──────────────────────────────────────────────────────────

export default function IntentPanel({ isOnline }) {
  const [intents, setIntents]       = useState([]);
  const [summary, setSummary]       = useState(null);
  const [inputText, setInputText]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);

  const fetchIntents = useCallback(async () => {
    if (!isOnline) return;
    try {
      const [iRes, sRes] = await Promise.all([
        fetch("/api/v1/intents"),
        fetch("/api/v1/intents/summary"),
      ]);
      if (iRes.ok) setIntents(await iRes.json());
      if (sRes.ok) setSummary(await sRes.json());
    } catch {}
  }, [isOnline]);

  useEffect(() => {
    fetchIntents();
    const id = setInterval(fetchIntents, 5000);
    return () => clearInterval(id);
  }, [fetchIntents]);

  const submitIntent = async () => {
    if (!inputText.trim()) return;
    if (!isOnline) { setError("Backend offline — start Spring Boot first"); return; }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/v1/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: inputText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Submission failed");
      } else {
        const data = await res.json();
        setSuccess(`Intent parsed as: ${data.policyType?.replace(/_/g, " ")} · "${data.parsedExplanation}"`);
        setInputText("");
        await fetchIntents();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const pauseIntent = async (id) => {
    await fetch(`/api/v1/intents/${id}/pause`, { method: "PUT" });
    fetchIntents();
  };

  const resumeIntent = async (id) => {
    await fetch(`/api/v1/intents/${id}/resume`, { method: "PUT" });
    fetchIntents();
  };

  const deleteIntent = async (id) => {
    await fetch(`/api/v1/intents/${id}`, { method: "DELETE" });
    fetchIntents();
  };

  const violated = intents.filter(i => i.status === "VIOLATED").length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
          🎯 Intent-Based Networking
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          IETF RFC 9315 · ETSI ZSM 006 · Express goals in plain language — Gemini enforces them automatically
        </p>
      </div>

      {/* Compliance summary strip */}
      {summary && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20,
        }}>
          {[
            { label: "Active Intents",  value: summary.total,          color: "#3b82f6" },
            { label: "Compliant",       value: summary.satisfied,       color: "#22c55e" },
            { label: "Violated",        value: summary.violated,        color: summary.violated > 0 ? "#ef4444" : "#22c55e" },
            { label: "Avg Compliance",  value: `${summary.avgCompliance}%`, color: summary.avgCompliance >= 80 ? "#22c55e" : "#f59e0b" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "12px 16px", textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Violation banner */}
      {violated > 0 && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
          padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#b91c1c", fontWeight: 600,
        }}>
          ⚠️ {violated} intent{violated !== 1 ? "s" : ""} currently violated — autonomous agent responding
        </div>
      )}

      {/* ── Intent input box ─────────────────────────────────────────────── */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: 12, padding: "16px 18px", marginBottom: 20,
      }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>
          ✍️ Express a new network intent
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitIntent(); } }}
            placeholder="e.g. Keep Banking SFC carbon below 100 gCO2/kWh at all times"
            disabled={submitting || !isOnline}
            rows={2}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 8,
              border: "1px solid #d1d5db", fontSize: 13, resize: "vertical",
              fontFamily: "inherit", outline: "none",
              opacity: !isOnline ? 0.5 : 1,
            }}
          />
          <button
            onClick={submitIntent}
            disabled={submitting || !inputText.trim() || !isOnline}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: submitting ? "#9ca3af" : "#3b82f6",
              color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: submitting || !inputText.trim() || !isOnline ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", alignSelf: "flex-start",
            }}
          >
            {submitting ? "⏳ Parsing…" : "Submit →"}
          </button>
        </div>

        {success && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#166534", background: "#dcfce7",
            borderRadius: 6, padding: "6px 10px" }}>
            ✅ {success}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>⚠️ {error}</div>
        )}
        {!isOnline && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Backend offline — start Spring Boot to enable intent submission
          </div>
        )}

        {/* Example suggestions */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>💡 Examples (click to fill):</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EXAMPLE_INTENTS.map(ex => (
              <button
                key={ex}
                onClick={() => setInputText(ex)}
                disabled={!isOnline}
                style={{
                  fontSize: 11, padding: "3px 9px", borderRadius: 20,
                  border: "1px solid #e2e8f0", background: "#fff",
                  color: "#6b7280", cursor: "pointer",
                  opacity: !isOnline ? 0.5 : 1,
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Intent list ─────────────────────────────────────────────────── */}
      <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>
        📋 Active Intents ({intents.length})
      </div>

      {intents.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 14,
          border: "2px dashed #e5e7eb", borderRadius: 10,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
          <div style={{ fontWeight: 600 }}>No intents defined</div>
          <div style={{ marginTop: 4 }}>Type a goal above and the system will enforce it automatically.</div>
        </div>
      )}

      {intents.map(intent => (
        <IntentCard
          key={intent.id}
          intent={intent}
          onPause={pauseIntent}
          onResume={resumeIntent}
          onDelete={deleteIntent}
        />
      ))}
    </div>
  );
}
