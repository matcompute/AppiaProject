/**
 * Appia — MCVPExplainer Component
 *
 * "Why was this SFC placed here?" — makes the placement algorithm transparent.
 *
 * Shows the full Multi-Criteria VNF Placement (MCVP) cost breakdown:
 *   J(n) = W_carbon·norm(carbon) + W_latency·norm(latency)
 *          + W_cost·norm(cost)   + W_load·norm(cpuLoad)
 *
 * Weights are priority-aware (3GPP QoS class aligned):
 *   CRITICAL (URLLC)  → W_latency = 0.50
 *   MEDIUM   (eMBB)   → balanced
 *   LOW      (mMTC)   → W_carbon = 0.45
 *
 * Data: GET /api/v1/mcvp/score?sfcId=SFC-BANK-01
 */

import { useState, useEffect } from 'react'

const PRIORITY_COLOR = { CRITICAL: '#ff3b30', MEDIUM: '#ffd60a', LOW: '#00ff9d' }
const CRITERION_COLOR = { carbon: '#00ff9d', latency: '#00d4ff', cost: '#a78bfa', load: '#ff9500' }
const CRITERION_LABEL = { carbon: 'Carbon', latency: 'Latency', cost: 'Cost', load: 'CPU Load' }
const FLAG = { 'NO': '🇳🇴', 'DK': '🇩🇰', 'IT': '🇮🇹', 'DE': '🇩🇪', 'ET': '🇪🇹' }

// ── Mini stacked bar showing J(n) breakdown ───────────────────────────────────
function ScoreBar({ breakdown, totalScore, isWinner, isCurrentNode }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 0.001
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Stacked bar */}
      <div style={{
        display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden',
        border: isWinner ? '1px solid rgba(0,255,157,0.6)' : '1px solid rgba(255,255,255,0.05)',
      }}>
        {Object.entries(breakdown).map(([k, v]) => (
          <div key={k} title={`${CRITERION_LABEL[k]}: ${v.toFixed(3)}`} style={{
            width: `${(v / total) * 100}%`,
            background: CRITERION_COLOR[k],
            opacity: 0.85,
            transition: 'width 0.4s ease',
          }} />
        ))}
      </div>
      {/* Score label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
          color: isWinner ? '#00ff9d' : 'rgba(255,255,255,0.4)',
          fontWeight: isWinner ? 700 : 400,
        }}>
          J(n) = {totalScore.toFixed(3)}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {isWinner && (
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 9999,
              background: 'rgba(0,255,157,0.15)', color: '#00ff9d', fontWeight: 700,
            }}>★ BEST</span>
          )}
          {isCurrentNode && (
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 9999,
              background: 'rgba(0,212,255,0.15)', color: '#00d4ff', fontWeight: 700,
            }}>CURRENT</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Weight pill ───────────────────────────────────────────────────────────────
function WeightPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: `${color}15`, border: `1px solid ${color}40`,
      borderRadius: 8, padding: '6px 12px', minWidth: 64,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{label}</span>
    </div>
  )
}

// ── Main MCVPExplainer ────────────────────────────────────────────────────────
export default function MCVPExplainer({ sfcs, isOnline }) {
  const [selectedSfc, setSelectedSfc] = useState(null)
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // Auto-select first SFC on mount
  useEffect(() => {
    if (sfcs?.length && !selectedSfc) setSelectedSfc(sfcs[0].sfc_id)
  }, [sfcs])

  useEffect(() => {
    if (!selectedSfc) return
    setLoading(true)
    setError(null)

    if (!isOnline) {
      // Offline: generate synthetic data from mock SFC list
      const sfc = sfcs.find(s => s.sfc_id === selectedSfc)
      if (sfc) setData(generateOfflineData(sfc))
      setLoading(false)
      return
    }

    fetch(`/api/v1/mcvp/score?sfcId=${encodeURIComponent(selectedSfc)}`, {
      signal: AbortSignal.timeout(4000),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(`Fetch failed: ${e}`); setLoading(false) })
  }, [selectedSfc, isOnline])

  // ── Offline synthetic data (mirrors OrchestrationService weight logic) ──────
  function generateOfflineData(sfc) {
    const NODES = [
      { nodeId: 'NO-OSLO-01', nodeName: 'Oslo Edge',       locationCode: 'NO', carbon: 25,  latency: 8,  cost: 0.04, cpu: 35 },
      { nodeId: 'DK-CPH-01',  nodeName: 'Copenhagen Core', locationCode: 'DK', carbon: 110, latency: 12, cost: 0.12, cpu: 55 },
      { nodeId: 'IT-MIL-01',  nodeName: 'Milan DC',        locationCode: 'IT', carbon: 265, latency: 18, cost: 0.22, cpu: 42 },
      { nodeId: 'DE-FRA-01',  nodeName: 'Frankfurt Core',  locationCode: 'DE', carbon: 310, latency: 15, cost: 0.18, cpu: 68 },
      { nodeId: 'ET-ADD-01',  nodeName: 'Addis Edge',      locationCode: 'ET', carbon: 30,  latency: 35, cost: 0.05, cpu: 20 },
    ]
    const priority = sfc.priority || 'MEDIUM'
    const wMap = {
      CRITICAL: [0.20, 0.50, 0.10, 0.20],
      MEDIUM:   [0.35, 0.25, 0.25, 0.15],
      LOW:      [0.45, 0.10, 0.35, 0.10],
    }
    const w = wMap[priority] || wMap.MEDIUM
    const maxC = Math.max(...NODES.map(n => n.carbon))
    const maxL = Math.max(...NODES.map(n => n.latency))
    const maxP = Math.max(...NODES.map(n => n.cost))

    const candidates = NODES.map(n => {
      const nC = n.carbon  / maxC
      const nL = n.latency / maxL
      const nP = n.cost    / maxP
      const nLd = n.cpu    / 100
      const J = w[0]*nC + w[1]*nL + w[2]*nP + w[3]*nLd
      return {
        nodeId: n.nodeId, nodeName: n.nodeName, locationCode: n.locationCode,
        status: 'ONLINE',
        carbonGco2: n.carbon, latencyMs: n.latency, costEur: n.cost, cpuLoadPct: n.cpu,
        totalScore: Math.round(J * 1000) / 1000,
        breakdown: {
          carbon:  Math.round(w[0]*nC  * 1000) / 1000,
          latency: Math.round(w[1]*nL  * 1000) / 1000,
          cost:    Math.round(w[2]*nP  * 1000) / 1000,
          load:    Math.round(w[3]*nLd * 1000) / 1000,
        },
        isCurrentNode: n.nodeId === sfc.assigned_node,
      }
    }).sort((a, b) => a.totalScore - b.totalScore)
    candidates[0].isWinner = true

    return {
      sfc: { sfcId: sfc.sfc_id, name: sfc.name, priority, assignedNode: sfc.assigned_node },
      weights: { wCarbon: w[0], wLatency: w[1], wCost: w[2], wLoad: w[3], priority },
      candidates,
      offline: true,
    }
  }

  const priorityColor = data ? (PRIORITY_COLOR[data.sfc?.priority] || '#6b7fa3') : '#6b7fa3'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div className="appia-card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--appia-accent)', letterSpacing: 2 }}>
              MCVP PLACEMENT EXPLAINER
            </span>
            <div style={{ fontSize: 11, color: 'var(--appia-muted)', marginTop: 2 }}>
              J(n) = W<sub>c</sub>·carbon + W<sub>l</sub>·latency + W<sub>p</sub>·cost + W<sub>ld</sub>·cpuLoad — lower score wins
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {data?.offline && (
              <span style={{ fontSize: 10, color: '#ffd60a', padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.3)' }}>
                SIMULATION MODE
              </span>
            )}
            {!data?.offline && isOnline && (
              <span style={{ fontSize: 10, color: '#00ff9d', padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(0,255,157,0.1)', border: '1px solid rgba(0,255,157,0.3)' }}>
                🔴 LIVE
              </span>
            )}
          </div>
        </div>

        {/* SFC selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sfcs?.map(s => (
            <button key={s.sfc_id} onClick={() => setSelectedSfc(s.sfc_id)} style={{
              padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
              background: selectedSfc === s.sfc_id ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: selectedSfc === s.sfc_id ? 'var(--appia-accent)' : 'var(--appia-muted)',
              border: `1px solid ${selectedSfc === s.sfc_id ? 'rgba(0,212,255,0.4)' : 'var(--appia-border)'}`,
              fontWeight: selectedSfc === s.sfc_id ? 700 : 400,
            }}>
              <span style={{ color: PRIORITY_COLOR[s.priority] || '#6b7fa3', marginRight: 4 }}>◆</span>
              {s.sfc_id}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="appia-card" style={{ padding: 24, textAlign: 'center', color: 'var(--appia-muted)' }}>
          Computing MCVP scores…
        </div>
      )}
      {error && (
        <div className="appia-card" style={{ padding: 16, color: '#ff6b6b', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Main content */}
      {data && !loading && (
        <>
          {/* SFC info + weight vector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* SFC summary */}
            <div className="appia-card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--appia-muted)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                SFC Profile
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--appia-text)', marginBottom: 6 }}>
                {data.sfc?.name || data.sfc?.sfcId}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Priority', value: data.sfc?.priority, color: priorityColor },
                  { label: 'Status',   value: data.sfc?.status,   color: 'var(--appia-muted)' },
                  { label: 'CPU',      value: `${data.sfc?.cpuRequired}c`, color: '#00d4ff' },
                  { label: 'RAM',      value: `${data.sfc?.memRequired}GB`, color: '#a78bfa' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px' }}>
                    <div style={{ fontSize: 9, color: 'var(--appia-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color }}>{value ?? '—'}</div>
                  </div>
                ))}
              </div>
              {data.sfc?.assignedNode && (
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--appia-muted)' }}>
                  Currently on: <span style={{ color: '#00d4ff', fontWeight: 600 }}>{data.sfc.assignedNode}</span>
                </div>
              )}
            </div>

            {/* Weight vector */}
            <div className="appia-card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--appia-muted)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                Weight Vector W — {data.weights?.priority} class
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <WeightPill label="Carbon"  value={data.weights?.wCarbon}  color={CRITERION_COLOR.carbon} />
                <WeightPill label="Latency" value={data.weights?.wLatency} color={CRITERION_COLOR.latency} />
                <WeightPill label="Cost"    value={data.weights?.wCost}    color={CRITERION_COLOR.cost} />
                <WeightPill label="Load"    value={data.weights?.wLoad}    color={CRITERION_COLOR.load} />
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(CRITERION_COLOR).map(([k, c]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                    <span style={{ fontSize: 9, color: 'var(--appia-muted)' }}>{CRITERION_LABEL[k]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Candidate ranking table */}
          <div className="appia-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--appia-muted)', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>
              Candidate Node Ranking — J(n) lower = better
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.candidates?.map((node, rank) => (
                <div key={node.nodeId} style={{
                  background: node.isWinner ? 'rgba(0,255,157,0.05)' : node.isCurrentNode ? 'rgba(0,212,255,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${node.isWinner ? 'rgba(0,255,157,0.25)' : node.isCurrentNode ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 180px', gap: 12, alignItems: 'center' }}>

                    {/* Rank */}
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: rank === 0 ? 'rgba(0,255,157,0.2)' : 'rgba(255,255,255,0.06)',
                      fontSize: 12, fontWeight: 700,
                      color: rank === 0 ? '#00ff9d' : 'var(--appia-muted)',
                    }}>
                      {rank + 1}
                    </div>

                    {/* Node identity */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--appia-text)' }}>
                        {FLAG[node.locationCode] || '🌍'} {node.nodeName}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--appia-muted)', fontFamily: 'monospace' }}>{node.nodeId}</div>
                    </div>

                    {/* Raw metrics */}
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: 'Carbon', value: `${node.carbonGco2}`, unit: 'gCO₂', color: CRITERION_COLOR.carbon },
                        { label: 'Latency', value: `${node.latencyMs}`, unit: 'ms',   color: CRITERION_COLOR.latency },
                        { label: 'Cost',   value: `€${node.costEur?.toFixed(3)}`, unit: '/kWh', color: CRITERION_COLOR.cost },
                        { label: 'CPU',    value: `${node.cpuLoadPct?.toFixed(0)}`, unit: '%', color: CRITERION_COLOR.load },
                      ].map(({ label, value, unit, color }) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: 'var(--appia-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color }}>
                            {value}<span style={{ fontSize: 8, color: 'var(--appia-muted)', marginLeft: 1 }}>{unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Score bar */}
                    <div style={{ minWidth: 160 }}>
                      <ScoreBar
                        breakdown={node.breakdown}
                        totalScore={node.totalScore}
                        isWinner={node.isWinner}
                        isCurrentNode={node.isCurrentNode}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.ineligibleCount > 0 && (
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--appia-muted)', fontStyle: 'italic' }}>
                {data.ineligibleCount} node(s) excluded — insufficient CPU/RAM/bandwidth capacity.
              </div>
            )}
          </div>

          {/* Formula box — paper-ready */}
          <div className="appia-card" style={{ padding: '12px 16px', background: 'rgba(0,212,255,0.03)', borderColor: 'rgba(0,212,255,0.12)' }}>
            <div style={{ fontSize: 10, color: 'var(--appia-muted)', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
              MCVP Cost Function (Paper §III-B)
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--appia-text)', lineHeight: 1.8 }}>
              <span style={{ color: '#00d4ff' }}>J(n)</span> = W<sub>c</sub>·<span style={{ color: CRITERION_COLOR.carbon }}>carbon̂</span>
              {' '}+ W<sub>l</sub>·<span style={{ color: CRITERION_COLOR.latency }}>latencŷ</span>
              {' '}+ W<sub>p</sub>·<span style={{ color: CRITERION_COLOR.cost }}>cost̂</span>
              {' '}+ W<sub>ld</sub>·<span style={{ color: CRITERION_COLOR.load }}>load̂</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--appia-muted)', marginTop: 4 }}>
              All metrics normalised ∈ [0,1] across candidate set. Weights align with 3GPP QoS class priorities (TS 23.501 §5.7.2).
            </div>
          </div>
        </>
      )}
    </div>
  )
}
