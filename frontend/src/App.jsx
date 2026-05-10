import React, { useState, useEffect, useCallback, useRef } from 'react'
import NetworkMap from './components/NetworkMap'
import NodeCard from './components/NodeCard'
import SFCTable from './components/SFCTable'
import MetricsDashboard from './components/MetricsDashboard'
import SimulationControls from './components/SimulationControls'
import AskAppia from './components/AskAppia'
import EventLog from './components/EventLog'
import IntentPanel from './components/IntentPanel'
import ResiliencePanel from './components/ResiliencePanel'
import SlicePanel from './components/SlicePanel'
import BenchmarkPanel from './components/BenchmarkPanel'
import MCVPExplainer from './components/MCVPExplainer'
import ArchitectureDiagram from './components/ArchitectureDiagram'
import { useBackend } from './hooks/useBackend'
import { CARBON_HISTORY } from './data/mockData'  // fallback only — live data preferred

// ── Local simulation helpers (used when backend is offline) ───────────────────
const solarAvail = (h) => {
  if (h < 6 || h > 20) return 0
  return Math.max(0, 0.95 * Math.exp(-Math.pow(h - 13, 2) / 50) + (Math.random() - 0.5) * 0.05)
}
const windAvail = (h) => Math.max(0.05, 0.55 + 0.15 * Math.sin(2 * Math.PI * (h - 14) / 24) + (Math.random() - 0.5) * 0.12)
const gridCarbon = (h, base) => {
  const peak = (h >= 8 && h <= 10) || (h >= 18 && h <= 20) ? 1.25 : h <= 5 ? 0.75 : 1.0
  return Math.round(base * peak + (Math.random() - 0.5) * base * 0.05)
}
const gridPrice = (h, base) => {
  const peak = (h >= 7 && h <= 9) || (h >= 17 && h <= 21) ? 1.4 : h <= 5 ? 0.6 : 1.0
  return parseFloat((base * peak + (Math.random() - 0.5) * 0.005).toFixed(4))
}

const BASE_CARBON = { 'NO-OSLO-01': 25, 'DK-CPH-01': 120, 'IT-MIL-01': 280, 'DE-FRA-01': 320, 'ET-ADD-01': 30 }
const BASE_PRICE  = { 'NO-OSLO-01': 0.04, 'DK-CPH-01': 0.12, 'IT-MIL-01': 0.22, 'DE-FRA-01': 0.18, 'ET-ADD-01': 0.05 }

function simulateHour(nodes, hour) {
  return nodes.map(node => {
    const base_c = BASE_CARBON[node.node_id] || 200
    const base_p = BASE_PRICE[node.node_id] || 0.15
    let carbon = gridCarbon(hour, base_c)
    let cost   = gridPrice(hour, base_p)
    if (node.node_id === 'NO-OSLO-01') {
      const solar = solarAvail(hour)
      carbon = Math.round(carbon * (1 - solar * 0.4))
      cost   = parseFloat((cost * (1 - solar * 0.2)).toFixed(4))
    }
    if (node.node_id === 'DK-CPH-01') {
      const wind = windAvail(hour)
      carbon = Math.round(carbon * (1 - wind * 0.5))
      cost   = parseFloat((cost * (1 - wind * 0.3)).toFixed(4))
    }
    let battery = node.battery_level
    if (node.node_id === 'ET-ADD-01' && battery > 0) {
      const solar = solarAvail(hour)
      battery = solar > 0.1 ? Math.min(1.0, battery + 0.04) : Math.max(0.05, battery - 0.02)
      carbon  = Math.round(solar > 0.3 ? 8 + Math.random() * 5 : 180 + Math.random() * 30)
    }
    const loadNoise = (Math.random() - 0.5) * 0.04
    return {
      ...node,
      carbon_intensity: Math.max(5, carbon),
      energy_cost:      Math.max(0.005, cost),
      battery_level:    battery,
      cpu_load:         Math.max(0, Math.min(1, node.cpu_load + loadNoise)),
      memory_load:      Math.max(0, Math.min(1, node.memory_load + loadNoise * 0.5)),
    }
  })
}

// ── App ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', icon: '⬡', label: 'Overview'   },
  { id: 'nodes',    icon: '◉', label: 'Nodes'      },
  { id: 'sfcs',     icon: '≡', label: 'SFCs'       },
  { id: 'metrics',  icon: '◈', label: 'Metrics'    },
  { id: 'events',     icon: '🤖', label: 'Events',     badge: 'NEW' },
  { id: 'intents',    icon: '🎯', label: 'Intents',    badge: 'NEW' },
  { id: 'resilience', icon: '🛡️', label: 'Resilience', badge: 'NEW' },
  { id: 'slices',     icon: '🍕', label: 'Slicing',    badge: 'NEW' },
  { id: 'benchmark',  icon: '📊', label: 'Benchmark',  badge: 'NEW' },
  { id: 'mcvp',       icon: '🧮', label: 'MCVP',       badge: 'NEW' },
  { id: 'arch',       icon: '🏗️', label: 'Architecture', badge: 'NEW' },
  { id: 'advisor',    icon: '✦',  label: 'Ask Appia'              },
]

export default function App() {
  const backend = useBackend()

  // Local simulation state (mirrors backend nodes when offline, or overrides for sim)
  const [simNodes,  setSimNodes]  = useState(null)
  const [hour,      setHour]      = useState(9)
  const [isRunning, setIsRunning] = useState(false)
  const [speed,     setSpeed]     = useState(1)
  const [selectedNode, setSelectedNode] = useState(null)
  const [activeTab,    setActiveTab]    = useState('overview')
  const timerRef = useRef(null)

  // Sync sim nodes from backend when first loaded
  useEffect(() => {
    if (backend.nodes && !simNodes) setSimNodes(backend.nodes)
  }, [backend.nodes])

  const nodes = simNodes || backend.nodes
  const sfcs  = backend.sfcs
  // Live data preferred; fall back to mock when backend is offline or has no history yet
  const carbonHistory  = backend.carbonHistory  || CARBON_HISTORY
  const benchmarkStats = backend.benchmarkStats

  const tick = useCallback(() => {
    setHour(h => {
      const next = (h + 1) % 24
      // When backend is online, it provides real data — local sim just for time display
      if (!backend.isOnline) setSimNodes(prev => prev ? simulateHour(prev, next) : null)
      return next
    })
  }, [backend.isOnline])

  useEffect(() => {
    if (isRunning) timerRef.current = setInterval(tick, 1500 / speed)
    else clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [isRunning, speed, tick])

  const handleReset = () => {
    setIsRunning(false)
    setHour(9)
    setSimNodes(backend.nodes)
    setSelectedNode(null)
  }

  const sfcCount = {}
  sfcs.forEach(s => { if (s.assigned_node) sfcCount[s.assigned_node] = (sfcCount[s.assigned_node] || 0) + 1 })

  const dataSource = backend.isOnline ? 'live' : 'simulation'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--appia-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--appia-border)' }}>
        <SimulationControls
          hour={hour}
          isRunning={isRunning}
          onToggle={() => setIsRunning(r => !r)}
          onReset={handleReset}
          onStep={tick}
          speed={speed}
          onSpeedChange={setSpeed}
          source={dataSource}
        />
      </div>

      {/* Nav tabs — horizontally scrollable so all 12 tabs stay accessible */}
      <div style={{
        display: 'flex', gap: 2, padding: '6px 16px',
        borderBottom: '1px solid var(--appia-border)',
        alignItems: 'center', overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',   /* Firefox */
        msOverflowStyle: 'none',  /* IE/Edge */
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '5px 12px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8,
            background: activeTab === tab.id ? 'rgba(0,212,255,0.12)' : 'transparent',
            color: activeTab === tab.id
              ? (tab.id === 'advisor' ? '#a78bfa' : 'var(--appia-accent)')
              : 'var(--appia-muted)',
            border: `1px solid ${activeTab === tab.id
              ? (tab.id === 'advisor' ? 'rgba(167,139,250,0.35)' : 'rgba(0,212,255,0.35)')
              : 'transparent'}`,
            whiteSpace: 'nowrap',
          }}>
            {tab.icon} {tab.label}
            {tab.id === 'advisor' && (
              <span style={{
                marginLeft: 5, fontSize: 7, padding: '1px 4px', borderRadius: 4,
                background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
                fontWeight: 700, letterSpacing: 0.5,
              }}>AI</span>
            )}
            {tab.badge && tab.id !== 'advisor' && (
              <span style={{
                marginLeft: 5, fontSize: 7, padding: '1px 4px', borderRadius: 4,
                background: 'rgba(34,197,94,0.2)', color: '#22c55e',
                fontWeight: 700, letterSpacing: 0.5,
              }}>{tab.badge}</span>
            )}
          </button>
        ))}

        {/* Backend status pill */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: backend.isOnline ? '#00ff9d' : '#ff6b6b',
          }}/>
          <span style={{ fontSize: 10, color: backend.isOnline ? '#00ff9d' : '#ff6b6b' }}>
            {backend.isOnline ? 'BACKEND LIVE' : 'SIMULATION MODE'}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, height: 'calc(100vh - 160px)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <NetworkMap
                nodes={nodes}
                links={backend.links}
                sfcs={sfcs}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
              />
              {selectedNode && (() => {
                const node = nodes.find(n => n.node_id === selectedNode)
                return node ? (
                  <NodeCard
                    node={node}
                    isSelected={true}
                    onClick={() => setSelectedNode(null)}
                    sfcCount={sfcCount[node.node_id] || 0}
                  />
                ) : null
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              {/* KPI strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'SLA OK',    value: `${sfcs.filter(s=>s.sla_ok).length}/${sfcs.length}`, color: '#00ff9d' },
                  { label: 'Avg Carbon', value: `${Math.round(nodes.reduce((a,n)=>a+n.carbon_intensity,0)/nodes.length)}`, unit: 'gCO₂', color: '#ffd60a' },
                  { label: 'Avg Cost',  value: `€${(nodes.reduce((a,n)=>a+n.energy_cost,0)/nodes.length).toFixed(3)}`, color: '#00d4ff' },
                  { label: 'Greenest', value: nodes.reduce((a,b)=>a.carbon_intensity<b.carbon_intensity?a:b).flag, unit: nodes.reduce((a,b)=>a.carbon_intensity<b.carbon_intensity?a:b).name, color: '#00ff9d' },
                ].map(({ label, value, unit, color }) => (
                  <div key={label} className="appia-card" style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 9, color: 'var(--appia-muted)', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                    {unit && <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>{unit}</div>}
                  </div>
                ))}
              </div>
              <SFCTable sfcs={sfcs} nodes={nodes} filterNode={selectedNode} />
            </div>
          </div>
        )}

        {/* NODES TAB */}
        {activeTab === 'nodes' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {nodes.map(node => (
              <NodeCard
                key={node.node_id}
                node={node}
                isSelected={selectedNode === node.node_id}
                onClick={() => setSelectedNode(selectedNode === node.node_id ? null : node.node_id)}
                sfcCount={sfcCount[node.node_id] || 0}
              />
            ))}
          </div>
        )}

        {/* SFCs TAB */}
        {activeTab === 'sfcs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                  padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  background: !selectedNode ? 'rgba(0,212,255,0.12)' : 'transparent',
                  color: !selectedNode ? 'var(--appia-accent)' : 'var(--appia-muted)',
                  border: `1px solid ${!selectedNode ? 'rgba(0,212,255,0.3)' : 'var(--appia-border)'}`,
                }}
              >All Nodes</button>
              {nodes.map(n => (
                <button
                  key={n.node_id}
                  onClick={() => setSelectedNode(selectedNode === n.node_id ? null : n.node_id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                    background: selectedNode === n.node_id ? 'rgba(0,212,255,0.12)' : 'transparent',
                    color: selectedNode === n.node_id ? 'var(--appia-accent)' : 'var(--appia-muted)',
                    border: `1px solid ${selectedNode === n.node_id ? 'rgba(0,212,255,0.3)' : 'var(--appia-border)'}`,
                  }}
                >{n.flag} {n.name}</button>
              ))}
            </div>
            <SFCTable sfcs={sfcs} nodes={nodes} filterNode={selectedNode} />
          </div>
        )}

        {/* METRICS TAB */}
        {activeTab === 'metrics' && (
          <MetricsDashboard
            nodes={nodes}
            sfcs={sfcs}
            carbonHistory={carbonHistory}
            currentHour={hour}
            isLiveData={!!backend.carbonHistory}
          />
        )}

        {/* E