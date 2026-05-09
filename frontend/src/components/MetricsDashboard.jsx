import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#111927', border: '1px solid #1e2d45',
      borderRadius: 8, padding: '10px 14px', fontSize: 11
    }}>
      <div style={{ color: '#6b7fa3', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span>{p.name}</span>
          <span className="mono" style={{ fontWeight: 600 }}>{p.value} gCO₂</span>
        </div>
      ))}
    </div>
  )
}

export default function MetricsDashboard({ nodes, sfcs, carbonHistory, currentHour }) {
  const totalSfcs = sfcs.length
  const slaOk = sfcs.filter(s => s.sla_ok).length
  const slaRate = Math.round((slaOk / totalSfcs) * 100)
  const criticalViolations = sfcs.filter(s => s.priority === 'CRITICAL' && !s.sla_ok).length
  const avgCarbon = Math.round(nodes.reduce((a, n) => a + n.carbon_intensity, 0) / nodes.length)
  const avgCost   = (nodes.reduce((a, n) => a + n.energy_cost, 0) / nodes.length).toFixed(4)
  const greenestNode = nodes.reduce((a, b) => a.carbon_intensity < b.carbon_intensity ? a : b)
  const totalPower = Math.round(nodes.reduce((a, n) => a + n.available_power_kw, 0))

  const LINES = [
    { key: 'oslo',       name: '🇳🇴 Oslo',       color: '#00ff9d' },
    { key: 'copenhagen', name: '🇩🇰 Copenhagen', color: '#00d4ff' },
    { key: 'frankfurt',  name: '🇩🇪 Frankfurt',  color: '#ff9500' },
    { key: 'milan',      name: '🇮🇹 Milan',      color: '#c084fc' },
    { key: 'addis',      name: '🇪🇹 Addis',      color: '#ffd60a' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { label: 'SLA Compliance', value: `${slaRate}%`, color: slaRate >= 95 ? '#00ff9d' : slaRate >= 80 ? '#ffd60a' : '#ff3b30', sub: `${slaOk}/${totalSfcs} services` },
          { label: 'Critical Violations', value: criticalViolations, color: criticalViolations === 0 ? '#00ff9d' : '#ff3b30', sub: criticalViolations === 0 ? 'All clear ✓' : 'ACTION REQUIRED' },
          { label: 'Avg Carbon', value: `${avgCarbon}`, unit: 'gCO₂/kWh', color: avgCarbon < 150 ? '#00ff9d' : avgCarbon < 250 ? '#ffd60a' : '#ff9500', sub: `Greenest: ${greenestNode.flag} ${greenestNode.name}` },
          { label: 'Avg Energy Cost', value: `€${avgCost}`, unit: '/kWh', color: '#00d4ff', sub: 'Weighted avg' },
          { label: 'Total Capacity', value: totalPower.toLocaleString(), unit: 'kW', color: '#a78bfa', sub: '5 nodes combined' },
        ].map(({ label, value, unit, color, sub }) => (
          <div key={label} className="appia-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--appia-muted)', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 3 }}>
              <span className="mono" style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
              {unit && <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>{unit}</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--appia-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Carbon chart */}
      <div className="appia-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--appia-accent)', letterSpacing: 2 }}>
            CARBON INTENSITY — 24H TREND
          </span>
          <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>gCO₂/kWh</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={carbonHistory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
            <XAxis
              dataKey="hour"
              tick={{ fill: '#6b7fa3', fontSize: 10 }}
              tickLine={false}
              interval={3}
            />
            <YAxis tick={{ fill: '#6b7fa3', fontSize: 10 }} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={150} stroke="rgba(0,212,255,0.3)" strokeDasharray="4 4"
              label={{ value: 'Green threshold', fill: '#00d4ff', fontSize: 9, position: 'right' }} />
            {LINES.map(l => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, stroke: l.color, strokeWidth: 2, fill: '#111927' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Energy mix per node */}
      <div className="appia-card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--appia-accent)', letterSpacing: 2, marginBottom: 12 }}>
          ENERGY MIX BY NODE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {nodes.map(node => {
            const mix = node.energy_mix || {}
            const total = Object.values(mix).reduce((a, b) => a + b, 0)
            const segments = Object.entries(mix)
            const MIX_COLORS = {
              hydro: '#00d4ff', solar: '#ffd60a', wind: '#00ff9d',
              gas: '#ff9500', coal: '#ff3b30', nuclear: '#a78bfa',
              renewable: '#00ff9d', other: '#6b7fa3', backup_diesel: '#ff3b30'
            }

            return (
              <div key={node.node_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 80, fontSize: 11 }}>{node.flag} {node.name.split(' ')[0]}</span>
                <div style={{ flex: 1, height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.05)' }}>
                  {segments.map(([key, pct]) => (
                    <div key={key} title={`${key}: ${pct}%`} style={{
                      width: `${(pct / total) * 100}%`,
                      background: MIX_COLORS[key] || '#6b7fa3',
                      transition: 'width 0.5s ease',
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, minWidth: 200 }}>
                  {segments.slice(0, 3).map(([key, pct]) => (
                    <span key={key} style={{ fontSize: 9, color: MIX_COLORS[key] || '#6b7fa3' }}>
                      {key} {pct}%
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
