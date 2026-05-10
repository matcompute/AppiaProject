import React from 'react'

const carbonColor = (v) => {
  if (v < 50)  return '#00ff9d'
  if (v < 150) return '#ffd60a'
  if (v < 300) return '#ff9500'
  return '#ff3b30'
}
const loadColor = (v) => {
  if (v < 0.6) return '#00ff9d'
  if (v < 0.85) return '#ffd60a'
  return '#ff3b30'
}

function GaugeBar({ value, color, label, unit, maxValue = 1 }) {
  const pct = Math.min((value / maxValue) * 100, 100)
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color }}>{value}{unit}</span>
      </div>
      <div className="gauge-track" style={{ height: 4 }}>
        <div className="gauge-fill" style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

export default function NodeCard({ node, isSelected, onClick, sfcCount = 0 }) {
  const cc = carbonColor(node.carbon_intensity)
  const statusClass = `badge-${node.status}`

  return (
    <div
      className={`appia-card ${isSelected ? 'glow-cyan' : ''}`}
      style={{
        padding: '14px 16px',
        cursor: 'pointer',
        borderColor: isSelected ? 'rgba(0,212,255,0.5)' : undefined,
        background: isSelected ? 'rgba(0,212,255,0.04)' : undefined,
      }}
      onClick={onClick}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 16 }}>{node.flag}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--appia-text)' }}>{node.name}</span>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 1, padding: '2px 6px',
            borderRadius: 4, textTransform: 'uppercase',
          }} className={statusClass}>{node.status}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: cc, lineHeight: 1 }}>
            {Math.round(node.carbon_intensity)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>gCO₂/kWh</div>
        </div>
      </div>

      {/* Gauges */}
      <GaugeBar value={Math.round(node.cpu_load * 100)} color={loadColor(node.cpu_load)} label="CPU Load" unit="%" maxValue={100} />
      <GaugeBar value={Math.round(node.memory_load * 100)} color={loadColor(node.memory_load)} label="Memory" unit="%" maxValue={100} />
      {node.battery_level >= 0 && (
        <GaugeBar
          value={Math.round(node.battery_level * 100)}
          color={node.battery_level > 0.3 ? '#00ff9d' : '#ff3b30'}
          label="Battery"
          unit="%"
          maxValue={100}
        />
      )}

      {/* Footer stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--appia-border)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 12, color: 'var(--appia-accent)', fontWeight: 600 }}>
            €{node.energy_cost.toFixed(3)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>/kWh</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 12, color: 'var(--appia-accent2)', fontWeight: 600 }}>
            {node.processing_latency_ms ?? '—'}ms
          </div>
          <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>proc. latency</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 12, color: sfcCount > 0 ? 'var(--appia-accent)' : 'var(--appia-muted)', fontWeight: 600 }}>
            {sfcCount}
          </div>
          <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>SFCs</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 12, color: 'var(--appia-text)', fontWeight: 600 }}>
            {node.available_power_kw}
          </div>
          <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>kW avail</div>
        </div>
      </div>

      {/* Node ID */}
      <div style={{ marginTop: 6, fontSize: 9, color: 'var(--appia-muted)', fontFamily: 'JetBrains Mono' }}>
        {node.node_id} · {(node.node_type || node.type || 'EDGE').toUpperCase()}
      </div>
    </div>
  )
}
