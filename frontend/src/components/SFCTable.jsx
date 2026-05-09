import React, { useState } from 'react'

const PRIORITY_ORDER = { CRITICAL: 3, MEDIUM: 2, LOW: 1 }
const PRIORITY_STYLE = {
  CRITICAL: { badge: 'badge-critical', dot: '#ff3b30' },
  MEDIUM:   { badge: 'badge-medium',   dot: '#ffd60a' },
  LOW:      { badge: 'badge-low',      dot: '#00ff9d' },
}
const STATUS_ICON = {
  running:   { icon: '▶', color: '#00ff9d' },
  shed:      { icon: '⏸', color: '#6b7fa3' },
  degraded:  { icon: '⚠', color: '#ff9500' },
  migrating: { icon: '↗', color: '#00d4ff' },
}

const NODE_SHORT = {
  'NO-OSLO-01': '🇳🇴 Oslo',
  'DK-CPH-01':  '🇩🇰 CPH',
  'IT-MIL-01':  '🇮🇹 Milan',
  'DE-FRA-01':  '🇩🇪 FRA',
  'ET-ADD-01':  '🇪🇹 Addis',
}

export default function SFCTable({ sfcs, nodes, filterNode }) {
  const [sortBy, setSortBy] = useState('priority')

  // Filter by selected node
  let displaySfcs = filterNode
    ? sfcs.filter(s => s.assigned_node === filterNode)
    : sfcs

  // Sort
  displaySfcs = [...displaySfcs].sort((a, b) => {
    if (sortBy === 'priority') return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
    if (sortBy === 'latency') return a.latency_ms - b.latency_ms
    if (sortBy === 'node') return (a.assigned_node || '').localeCompare(b.assigned_node || '')
    return 0
  })

  const nodeMap = Object.fromEntries(nodes.map(n => [n.node_id, n]))

  return (
    <div className="appia-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--appia-border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--appia-accent)', fontSize: 12, fontWeight: 600, letterSpacing: 2 }}>
            SERVICE FUNCTION CHAINS
          </span>
          {filterNode && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: 'rgba(0,212,255,0.1)', color: 'var(--appia-accent)',
              border: '1px solid rgba(0,212,255,0.3)'
            }}>
              {NODE_SHORT[filterNode] || filterNode}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['priority', 'latency', 'node'].map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              background: sortBy === s ? 'rgba(0,212,255,0.15)' : 'transparent',
              color: sortBy === s ? 'var(--appia-accent)' : 'var(--appia-muted)',
              border: `1px solid ${sortBy === s ? 'rgba(0,212,255,0.3)' : 'var(--appia-border)'}`,
              textTransform: 'capitalize',
            }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowY: 'auto', maxHeight: 320 }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 90px 100px 70px 70px 60px',
          padding: '8px 16px',
          borderBottom: '1px solid var(--appia-border)',
          fontSize: 9, color: 'var(--appia-muted)', fontWeight: 600, letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          <span>Service</span>
          <span>Priority</span>
          <span>Node</span>
          <span>Latency</span>
          <span>SLA</span>
          <span>Status</span>
        </div>

        {displaySfcs.map((sfc) => {
          const ps = PRIORITY_STYLE[sfc.priority]
          const st = STATUS_ICON[sfc.status] || STATUS_ICON.running
          const node = nodeMap[sfc.assigned_node]
          const slaOk = sfc.sla_ok

          return (
            <div
              key={sfc.sfc_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 100px 70px 70px 60px',
                padding: '10px 16px',
                borderBottom: '1px solid rgba(30,45,69,0.5)',
                alignItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Name */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--appia-text)', marginBottom: 1 }}>
                  {sfc.name}
                </div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--appia-muted)' }}>
                  {sfc.sfc_id}
                </div>
              </div>

              {/* Priority */}
              <div>
                <span className={`${ps.badge}`} style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                  fontWeight: 600, letterSpacing: 0.5
                }}>
                  {sfc.priority}
                </span>
              </div>

              {/* Node */}
              <div>
                <span style={{ fontSize: 11 }}>
                  {NODE_SHORT[sfc.assigned_node] || sfc.assigned_node || '—'}
                </span>
                {node && (
                  <div className="mono" style={{ fontSize: 9, color: 'var(--appia-muted)' }}>
                    {Math.round(node.carbon_intensity)} gCO₂
                  </div>
                )}
              </div>

              {/* Latency */}
              <div className="mono" style={{
                fontSize: 12, fontWeight: 600,
                color: sfc.latency_ms <= sfc.max_latency * 0.5 ? '#00ff9d' :
                       sfc.latency_ms <= sfc.max_latency ? '#ffd60a' : '#ff3b30'
              }}>
                {sfc.latency_ms}ms
              </div>

              {/* SLA */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: slaOk ? '#00ff9d' : '#ff3b30'
                }}>
                  {slaOk ? '✓ OK' : '✗ FAIL'}
                </span>
              </div>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: st.color, fontSize: 12 }}>{st.icon}</span>
                <span style={{ fontSize: 9, color: st.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {sfc.status}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      <div style={{
        display: 'flex', gap: 20, padding: '10px 16px',
        borderTop: '1px solid var(--appia-border)',
      }}>
        {[
          { label: 'CRITICAL', value: sfcs.filter(s => s.priority === 'CRITICAL').length, color: '#ff6b6b' },
          { label: 'MEDIUM',   value: sfcs.filter(s => s.priority === 'MEDIUM').length,   color: '#ffd60a' },
          { label: 'LOW',      value: sfcs.filter(s => s.priority === 'LOW').length,       color: '#00ff9d' },
          { label: 'SLA OK',   value: sfcs.filter(s => s.sla_ok).length,                  color: '#00ff9d' },
          { label: 'SHED',     value: sfcs.filter(s => s.status === 'shed').length,        color: '#6b7fa3' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--appia-muted)', letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
