/**
 * Appia — System Architecture Diagram
 *
 * Four-layer reference architecture for the NoF 2026 paper.
 * Renders as an animated SVG suitable for inclusion as a paper figure.
 *
 * Layers (top → bottom, following OSI/3GPP NF decomposition):
 *   1. Intent & Policy Layer   — IBN, Gemini LLM, NL→JSON pipeline
 *   2. Orchestration Layer     — PPO Agent, MCVP, ETSI ZSM closed-loop
 *   3. Virtualization Layer    — VNF chains, SFC graph, 3GPP slices
 *   4. Infrastructure Layer    — 5 geo-distributed nodes (NO/DK/IT/DE/ET)
 *
 * Future integration point:
 *   OMNeT++/INET ← telemetry adapter ← Infrastructure Layer
 *   (shown as dashed "planned" box)
 */

import { useState } from 'react'

// ── Color palette (matches Appia dark theme) ──────────────────────────────────
const C = {
  accent:  '#00d4ff',
  green:   '#00ff9d',
  purple:  '#a78bfa',
  yellow:  '#ffd60a',
  orange:  '#ff9500',
  red:     '#ff3b30',
  muted:   '#6b7fa3',
  border:  '#1e2d45',
  bg:      '#080c14',
  card:    '#0d1626',
}

// Layer palette
const LAYER = {
  intent:  { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.35)', color: C.purple,  label: 'Intent & Policy Layer' },
  orch:    { bg: 'rgba(0,212,255,0.08)',   border: 'rgba(0,212,255,0.35)',   color: C.accent,  label: 'Orchestration Layer' },
  virt:    { bg: 'rgba(0,255,157,0.06)',   border: 'rgba(0,255,157,0.3)',    color: C.green,   label: 'Virtualization Layer' },
  infra:   { bg: 'rgba(255,149,0,0.06)',   border: 'rgba(255,149,0,0.3)',    color: C.orange,  label: 'Infrastructure Layer' },
}

// ── Building blocks ───────────────────────────────────────────────────────────
function Box({ x, y, w, h, fill, stroke, rx = 4 }) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth="0.5" />
}

function Label({ x, y, text, size = 9, color = '#fff', bold = false, anchor = 'middle' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size}
      fill={color} fontWeight={bold ? 700 : 400} fontFamily="system-ui, sans-serif">
      {text}
    </text>
  )
}

function Arrow({ x1, y1, x2, y2, color = C.muted, dashed = false, label = '' }) {
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
  return (
    <g>
      <defs>
        <marker id={`arr-${color.replace('#','')}`} markerWidth="6" markerHeight="6"
          refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 Z" fill={color} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth="0.8"
        strokeDasharray={dashed ? '2 2' : 'none'}
        markerEnd={`url(#arr-${color.replace('#','')})`}
      />
      {label && <Label x={mid.x + 2} y={mid.y - 2} text={label} size={7} color={color} anchor="start" />}
    </g>
  )
}

function BiArrow({ x1, y1, x2, y2, color = C.muted, label = '' }) {
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
      <polygon points={`${x1},${y1-1.5} ${x1},${y1+1.5} ${x1-4},${y1}`} fill={color} />
      <polygon points={`${x2},${y2-1.5} ${x2},${y2+1.5} ${x2+4},${y2}`} fill={color} />
      {label && <Label x={mid.x} y={mid.y - 2} text={label} size={7} color={color} />}
    </g>
  )
}

// ── Layer band ────────────────────────────────────────────────────────────────
function LayerBand({ x, y, w, h, layer, num }) {
  const l = LAYER[layer]
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={l.bg} stroke={l.border} rx={6} />
      {/* Left label */}
      <text x={x + 7} y={y + h / 2} textAnchor="middle" fontSize={7}
        fill={l.color} fontWeight={700} fontFamily="system-ui"
        transform={`rotate(-90, ${x + 7}, ${y + h / 2})`}>
        {l.label}
      </text>
      {/* Layer number badge */}
      <Box x={x + 2} y={y + 3} w={10} h={10} fill={`${l.color}25`} stroke={`${l.color}60`} rx={3} />
      <Label x={x + 7} y={y + 10} text={`L${num}`} size={6} color={l.color} bold />
    </g>
  )
}

// ── Node block (infrastructure) ───────────────────────────────────────────────
function NodeBlock({ x, y, flag, code, carbon, color }) {
  return (
    <g>
      <Box x={x} y={y} w={28} h={20} fill="rgba(255,255,255,0.04)" stroke={`${color}60`} rx={3} />
      <Label x={x + 14} y={y + 8}  text={flag} size={10} />
      <Label x={x + 14} y={y + 15} text={code} size={6} color={color} />
      <Label x={x + 14} y={y + 20} text={`${carbon}g`} size={5} color={C.muted} />
    </g>
  )
}

// ── Component block ───────────────────────────────────────────────────────────
function CompBlock({ x, y, w = 42, h = 16, icon, label, sub, fill, stroke, textColor }) {
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill || 'rgba(255,255,255,0.05)'} stroke={stroke || C.border} rx={3} />
      <Label x={x + w / 2} y={y + 7}  text={`${icon} ${label}`} size={7} color={textColor || '#fff'} bold />
      {sub && <Label x={x + w / 2} y={y + 13} text={sub} size={5.5} color={C.muted} />}
    </g>
  )
}

// ── Main diagram ──────────────────────────────────────────────────────────────
export default function ArchitectureDiagram() {
  const [tooltip, setTooltip] = useState(null)
  const [highlight, setHighlight] = useState(null)

  const W = 720, H = 420
  const LX = 18   // layer band left x
  const CX = 30   // content start x

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div className="appia-card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, letterSpacing: 2 }}>
              SYSTEM ARCHITECTURE
            </span>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Four-layer reference architecture · NoF 2026 paper Figure 1
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.entries(LAYER).map(([k, l]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 9, color: C.muted }}>{l.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Diagram */}
      <div className="appia-card" style={{ padding: 0, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
          fontFamily="system-ui, -apple-system, sans-serif">
          {/* Background */}
          <rect width={W} height={H} fill={C.bg} />
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(20,40,70,0.5)" strokeWidth="0.3"/>
          </pattern>
          <rect width={W} height={H} fill="url(#grid)" />

          {/* ── LAYER 1: Intent & Policy (y 10–80) ─────────────────────────── */}
          <LayerBand x={LX} y={10} w={W-20} h={72} layer="intent" num={1} />

          <CompBlock x={CX}   y={18} w={90} h={22} icon="💬" label="NL Intent" sub="RFC 9315 IBN"
            fill="rgba(167,139,250,0.12)" stroke="rgba(167,139,250,0.5)" textColor={C.purple} />
          <CompBlock x={132}  y={18} w={100} h={22} icon="✦" label="Gemini LLM" sub="Intent Parser"
            fill="rgba(167,139,250,0.12)" stroke="rgba(167,139,250,0.5)" textColor={C.purple} />
          <CompBlock x={244}  y={18} w={100} h={22} icon="📋" label="Policy Engine" sub="JSON → enforcement"
            fill="rgba(167,139,250,0.12)" stroke="rgba(167,139,250,0.5)" textColor={C.purple} />
          <CompBlock x={356}  y={18} w={90} h={22} icon="📜" label="Audit Log" sub="NIS2 / DORA Art.21"
            fill="rgba(167,139,250,0.08)" stroke="rgba(167,139,250,0.3)" textColor={C.purple} />

          {/* Intent arrows */}
          <Arrow x1={120} y1={29}  x2={132} y2={29}  color={C.purple} label="NL" />
          <Arrow x1={232} y1={29}  x2={244} y2={29}  color={C.purple} label="JSON" />
          <Arrow x1={344} y1={29}  x2={356} y2={29}  color={C.purple} />

          {/* AI Advisor box */}
          <CompBlock x={500} y={18} w={90} h={22} icon="🤖" label="Ask Appia" sub="Gemini Q&A"
            fill="rgba(167,139,250,0.10)" stroke="rgba(167,139,250,0.4)" textColor={C.purple} />
          <CompBlock x={602} y={18} w={85} h={22} icon="📊" label="Proactive Recs" sub="ZSM REPORT"
            fill="rgba(167,139,250,0.08)" stroke="rgba(167,139,250,0.3)" textColor={C.purple} />
          <Arrow x1={590} y1={29}  x2={602} y2={29}  color={C.purple} />

          {/* Separator: L1 bottom labels */}
          <Label x={CX + 45}  y={72} text="IBN Pipeline" size={6} color="rgba(167,139,250,0.6)" />
          <Label x={500 + 45} y={72} text="AI Advisory" size={6} color="rgba(167,139,250,0.6)" />

          {/* ── LAYER 2: Orchestration (y 88–178) ──────────────────────────── */}
          <LayerBand x={LX} y={88} w={W-20} h={90} layer="orch" num={2} />

          {/* ZSM Closed-loop */}
          <Box x={CX} y={96} w={190} h={72} fill="rgba(0,212,255,0.05)" stroke="rgba(0,212,255,0.2)" rx={4} />
          <Label x={CX + 95} y={106} text="ETSI ZSM Closed-loop" size={7} color={C.accent} bold />
          {[
            { x: CX+4,   label: 'DETECT',  sub: 'telemetry' },
            { x: CX+38,  label: 'ANALYZE', sub: 'Gemini'   },
            { x: CX+72,  label: 'DECIDE',  sub: 'PPO/MCVP' },
            { x: CX+106, label: 'ACT',     sub: 'migrate'  },
            { x: CX+140, label: 'VERIFY',  sub: 'SLA check'},
          ].map((s, i) => (
            <g key={s.label}>
              <Box x={s.x} y={110} w={32} h={20} fill="rgba(0,212,255,0.1)" stroke="rgba(0,212,255,0.3)" rx={2} />
              <Label x={s.x+16} y={120} text={s.label} size={5.5} color={C.accent} bold />
              <Label x={s.x+16} y={126} text={s.sub}   size={4.5} color={C.muted} />
              {i < 4 && <Arrow x1={s.x+32} y1={120} x2={s.x+38} y2={120} color={`${C.accent}80`} />}
            </g>
          ))}
          {/* Loop-back arrow */}
          <path d={`M ${CX+172} 130 Q ${CX+182} 152 ${CX+95} 152 Q ${CX+8} 152 ${CX+4} 130`}
            fill="none" stroke={`${C.accent}50`} strokeWidth="0.6" strokeDasharray="2 2"
            markerEnd={`url(#arr-${C.accent.replace('#','')})`} />
          <Label x={CX+95} y={158} text="REPORT loop" size={5} color={`${C.accent}70`} />

          {/* PPO Agent */}
          <Box x={240} y={96} w={140} h={72} fill="rgba(0,212,255,0.05)" stroke="rgba(0,212,255,0.2)" rx={4} />
          <Label x={310} y={106} text="PPO RL Agent" size={7} color={C.accent} bold />
          <CompBlock x={244} y={110} w={64} h={18} icon="📐" label="State" sub="62-dim"
            fill="rgba(0,212,255,0.08)" stroke="rgba(0,212,255,0.25)" />
          <CompBlock x={312} y={110} w={64} h={18} icon="⚡" label="Action" sub="(N+1)^M"
            fill="rgba(0,212,255,0.08)" stroke="rgba(0,212,255,0.25)" />
          <Arrow x1={308} y1={119} x2={312} y2={119} color={C.accent} />
          <Box x={244} y={132} w={132} h={28} fill="rgba(0,212,255,0.06)" stroke="rgba(0,212,255,0.2)" rx={3} />
          <Label x={310} y={142} text="Reward: R = W_SLA·r_SLA + W_c·r_c" size={5.5} color={C.accent} />
          <Label x={310} y={150} text="+ W_cost·r_cost + W_resil·r_resil" size={5.5} color={C.accent} />
          <Label x={310} y={158} text="[0.35, 0.30, 0.20, 0.15]" size={5} color={C.muted} />

          {/* MCVP */}
          <Box x={392} y={96} w={140} h={72} fill="rgba(0,212,255,0.05)" stroke="rgba(0,212,255,0.2)" rx={4} />
          <Label x={462} y={106} text="MCVP Placement" size={7} color={C.accent} bold />
          <Label x={462} y={116} text="J(n) = Wc·carbon̂ + Wl·latencŷ" size={5.5} color="rgba(255,255,255,0.7)" />
          <Label x={462} y={124} text="+ Wp·cost̂ + Wld·load̂" size={5.5} color="rgba(255,255,255,0.7)" />
          {[
            { y: 134, label: 'CRITICAL', w: [0.20, 0.50, 0.10, 0.20], color: C.red },
            { y: 146, label: 'MEDIUM',   w: [0.35, 0.25, 0.25, 0.15], color: C.yellow },
            { y: 158, label: 'LOW',      w: [0.45, 0.10, 0.35, 0.10], color: C.green },
          ].map(r => (
            <g key={r.label}>
              <Label x={396} y={r.y} text={r.label} size={5.5} color={r.color} anchor="start" />
              <Label x={450} y={r.y} text={r.w.join(' ')} size={5.5} color={C.muted} />
            </g>
          ))}

          {/* Autonomous Agent */}
          <Box x={544} y={96} w={136} h={72} fill="rgba(0,212,255,0.05)" stroke="rgba(0,212,255,0.2)" rx={4} />
          <Label x={612} y={106} text="Autonomous Agent" size={7} color={C.accent} bold />
          {[
            '🔴 Node failure → migrate',
            '⚡ Carbon spike → rebalance',
            '📉 SLA breach → scale/shed',
            '🛡️ Cyber attack → isolate',
            '⚡ Power cut → battery',
          ].map((t, i) => (
            <Label key={i} x={548} y={118 + i * 10} text={t} size={5.5} color="rgba(255,255,255,0.6)" anchor="start" />
          ))}

          {/* L2 inter-component arrows */}
          <Arrow x1={222} y1={132} x2={240} y2={132} color={C.accent} label="decisions" />
          <Arrow x1={380} y1={132} x2={392} y2={132} color={C.accent} label="score" />
          <Arrow x1={532} y1={132} x2={544} y2={132} color={C.accent} label="events" />

          {/* ── LAYER 3: Virtualization (y 184–274) ─────────────────────────── */}
          <LayerBand x={LX} y={184} w={W-20} h={88} layer="virt" num={3} />

          {/* SFC chains */}
          <Box x={CX} y={192} w={210} h={72} fill="rgba(0,255,157,0.04)" stroke="rgba(0,255,157,0.2)" rx={4} />
          <Label x={CX+105} y={202} text="Service Function Chains (IETF RFC 7665)" size={7} color={C.green} bold />
          {[
            { y: 210, label: 'CRITICAL (URLLC)', chain: 'FW → LB → App', color: C.red },
            { y: 226, label: 'MEDIUM   (eMBB)',   chain: 'FW → CDN → Edge', color: C.yellow },
            { y: 242, label: 'LOW      (mMTC)',   chain: 'FW → IoT-GW', color: C.green },
          ].map(r => (
            <g key={r.label}>
              <Box x={CX+4} y={r.y} w={60} h={12} fill={`${r.color}18`} stroke={`${r.color}50`} rx={2} />
              <Label x={CX+34} y={r.y+8} text={r.label} size={5} color={r.color} />
              <Arrow x1={CX+64} y1={r.y+6} x2={CX+70} y2={r.y+6} color={`${r.color}80`} />
              <Box x={CX+70} y={r.y} w={70} h={12} fill={`${r.color}10`} stroke={`${r.color}40`} rx={2} />
              <Label x={CX+105} y={r.y+8} text={r.chain} size={5} color={`${r.color}cc`} />
            </g>
          ))}
          <Label x={CX+4} y={258} text="VNF: Firewall / LoadBalancer / CDN / IoT-GW" size={5} color={C.muted} anchor="start" />

          {/* 3GPP slices */}
          <Box x={248} y={192} w={150} h={72} fill="rgba(0,255,157,0.04)" stroke="rgba(0,255,157,0.2)" rx={4} />
          <Label x={323} y={202} text="3GPP Network Slices (TS 23.501)" size={7} color={C.green} bold />
          {[
            { y: 212, type: 'URLLC', desc: '<1ms E2E · 99.999% · preempt', color: C.red },
            { y: 232, type: 'eMBB',  desc: '>20Gbps DL · multi-layer', color: C.yellow },
            { y: 252, type: 'mMTC',  desc: '1M devices/km² · low power', color: C.green },
          ].map(s => (
            <g key={s.type}>
              <Box x={252} y={s.y} w={32} h={14} fill={`${s.color}20`} stroke={`${s.color}60`} rx={2} />
              <Label x={268} y={s.y+9} text={s.type} size={6} color={s.color} bold />
              <Label x={288} y={s.y+9} text={s.desc} size={5} color={C.muted} anchor="start" />
            </g>
          ))}

          {/* K8s / deployment */}
          <Box x={408} y={192} w={110} h={36} fill="rgba(0,255,157,0.04)" stroke="rgba(0,255,157,0.2)" rx={4} />
          <Label x={463} y={202} text="Kubernetes" size={7} color={C.green} bold />
          <Label x={463} y={214} text="Namespace isolation" size={5.5} color={C.muted} />
          <Label x={463} y={222} text="Replica scaling (N+1 A/S)" size={5.5} color={C.muted} />

          <Box x={408} y={234} w={110} h={36} fill="rgba(0,255,157,0.04)" stroke="rgba(0,255,157,0.2)" rx={4} />
          <Label x={463} y={244} text="Resilience Engine" size={7} color={C.green} bold />
          <Label x={463} y={256} text="Active/Standby failover" size={5.5} color={C.muted} />
          <Label x={463} y={264} text="MTTR < 50ms  · 5-nines" size={5.5} color={C.muted} />

          {/* Placement records */}
          <Box x={528} y={192} w={152} h={72} fill="rgba(0,255,157,0.04)" stroke="rgba(0,255,157,0.2)" rx={4} />
          <Label x={604} y={202} text="Placement Records (H2/DB)" size={7} color={C.green} bold />
          {[
            'sfcId · nodeId · agent',
            'carbonAtPlacement · cost',
            'slaWasMet · rewardSignal',
            'aiExplanation (Gemini)',
          ].map((t, i) => <Label key={i} x={532} y={214 + i * 12} text={`· ${t}`} size={5.5} color={C.muted} anchor="start" />)}

          {/* ── LAYER 4: Infrastructure (y 278–370) ─────────────────────────── */}
          <LayerBand x={LX} y={278} w={W-20} h={92} layer="infra" num={4} />

          {/* Nodes */}
          {[
            { x: CX,    flag: '🇳🇴', code: 'NO-OSLO-01',  carbon: 25,  color: C.green  },
            { x: CX+52, flag: '🇩🇰', code: 'DK-CPH-01',   carbon: 110, color: C.green  },
            { x: CX+104,flag: '🇮🇹', code: 'IT-MIL-01',   carbon: 265, color: C.orange },
            { x: CX+156,flag: '🇩🇪', code: 'DE-FRA-01',   carbon: 310, color: C.red    },
            { x: CX+208,flag: '🇪🇹', code: 'ET-ADD-01',   carbon: 30,  color: C.green  },
          ].map((n, i) => (
            <NodeBlock key={n.code} {...n} y={288} />
          ))}

          {/* Node links */}
          {[
            [CX+28, CX+52],   // Oslo→CPH
            [CX+80, CX+104],  // CPH→Milan
            [CX+80, CX+156],  // CPH→FRA (skip)
            [CX+132,CX+156],  // Milan→FRA
          ].map(([x1, x2], i) => (
            <line key={i} x1={x1} y1={298} x2={x2} y2={298}
              stroke={`${C.accent}50`} strokeWidth="0.5" />
          ))}
          {/* Submarine cable (Milan→Addis) */}
          <path d={`M ${CX+132} 308 Q ${CX+180} 340 ${CX+208} 308`}
            fill="none" stroke={`${C.orange}60`} strokeWidth="0.6" strokeDasharray="1.5 1.5" />
          <Label x={CX+175} y={345} text="submarine · 58ms" size={5} color={`${C.orange}80`} />

          {/* Python simulation + sensors */}
          <Box x={310} y={288} w={120} h={36} fill="rgba(255,149,0,0.06)" stroke="rgba(255,149,0,0.3)" rx={4} />
          <Label x={370} y={298} text="Python Simulation" size={7} color={C.orange} bold />
          <Label x={370} y={308} text="Stable-Baselines3 PPO" size={5.5} color={C.muted} />
          <Label x={370} y={316} text="Gymnasium env · telemetry push" size={5.5} color={C.muted} />

          {/* OMNeT++ planned */}
          <Box x={310} y={330} w={120} h={34} fill="rgba(255,149,0,0.03)" stroke="rgba(255,149,0,0.2)" rx={4}
            strokeDasharray="2 2" />
          <Label x={370} y={342} text="OMNeT++/INET (planned)" size={7} color={`${C.orange}80`} bold />
          <Label x={370} y={352} text="Real network simulation" size={5.5} color={C.muted} />
          <Label x={370} y={360} text="E2E latency · packet loss · BER" size={5.5} color={C.muted} />
          <Label x={370} y={368} text="→ telemetry adapter →" size={5.5} color={`${C.orange}60`} />

          {/* Spring Boot API */}
          <Box x={448} y={288} w={120} h={36} fill="rgba(255,149,0,0.06)" stroke="rgba(255,149,0,0.3)" rx={4} />
          <Label x={508} y={298} text="Spring Boot API" size={7} color={C.orange} bold />
          <Label x={508} y={308} text="/api/v1/nodes · /sfcs · /mcvp" size={5.5} color={C.muted} />
          <Label x={508} y={316} text="/placements · /topology" size={5.5} color={C.muted} />

          {/* React dashboard */}
          <Box x={584} y={288} w={112} h={36} fill="rgba(255,149,0,0.06)" stroke="rgba(255,149,0,0.3)" rx={4} />
          <Label x={640} y={298} text="React Dashboard" size={7} color={C.orange} bold />
          <Label x={640} y={308} text="NetworkMap · MCVP explainer" size={5.5} color={C.muted} />
          <Label x={640} y={316} text="Benchmark · Slicing panels" size={5.5} color={C.muted} />

          {/* ── Cross-layer arrows ─────────────────────────────────────────── */}
          {/* L1 ↔ L2 */}
          <Arrow x1={200} y1={82}  x2={200} y2={88}  color={C.purple} label="policy" />
          <Arrow x1={310} y1={88}  x2={310} y2={82}  color={C.accent} label="feedback" />

          {/* L2 ↔ L3 */}
          <Arrow x1={160} y1={178} x2={160} y2={184} color={C.accent} label="place" />
          <Arrow x1={300} y1={184} x2={300} y2={178} color={C.green}  label="SLA" />

          {/* L3 ↔ L4 */}
          <Arrow x1={160} y1={272} x2={160} y2={278} color={C.green}  label="deploy" />
          <Arrow x1={370} y1={278} x2={370} y2={272} color={C.orange} label="telemetry" />
          <Arrow x1={460} y1={278} x2={460} y2={272} color={C.orange} />

          {/* PPO ↔ Python sim (L2↔L4 cross) */}
          <path d={`M 310 178 L 310 260 L 370 260 L 370 278`}
            fill="none" stroke={`${C.accent}50`} strokeWidth="0.6" strokeDasharray="2 2" />
          <Label x={340} y={258} text="reward signal" size={5} color={`${C.accent}70`} />

          {/* Title watermark */}
          <Label x={W - 10} y={H - 5} text="Appia — Green 6G Orchestration  ·  NoF 2026"
            size={6} color="rgba(107,127,163,0.4)" anchor="end" />
        </svg>
      </div>

      {/* Key stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { label: 'State Space',   value: '62-dim',    sub: '5×6 node + 8×4 SFC',   color: C.accent },
          { label: 'Action Space',  value: '1.68M',     sub: '(N+1)^M = 6^8',         color: C.accent },
          { label: 'RL Algorithm',  value: 'PPO',       sub: 'Schulman et al. 2017',   color: C.purple },
          { label: 'Standards',     value: '3GPP+ETSI', sub: 'TS23.501 · ZSM · RFC9315', color: C.green },
          { label: 'Nodes',         value: '5 cities',  sub: 'NO DK IT DE ET',         color: C.orange },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="appia-card" style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: 'var(--appia-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--appia-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* OMNeT++ roadmap card */}
      <div className="appia-card" style={{ padding: '14px 16px', borderColor: `${C.orange}40`, background: `${C.orange}08` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 8 }}>
          🔬 OMNeT++/INET Integration Roadmap (Post NoF submission)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            {
              step: '1. Telemetry Adapter',
              desc: 'Python bridge reads OMNeT++ .vec/.sca output files → converts to Appia telemetry format → pushes to Spring Boot /api/v1/nodes/{id}/telemetry via REST.',
              status: 'planned',
            },
            {
              step: '2. INET Channel Models',
              desc: 'Replace constant latency values with INET\'s Eth10Gig / PPP channel models. Simulate packet loss, BER, and congestion. Feed real latency into MCVP J(n) scoring.',
              status: 'planned',
            },
            {
              step: '3. Co-simulation Loop',
              desc: 'PPO agent actions (VNF migration) feed back into OMNeT++ topology changes via the telemetry adapter. Enables end-to-end closed-loop evaluation — the gold standard for conference reviewers.',
              status: 'planned',
            },
          ].map(({ step, desc, status }) => (
            <div key={step} style={{ background: 'rgba(255,149,0,0.06)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,149,0,0.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 4 }}>{step}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{desc}</div>
              <div style={{ marginTop: 6, fontSize: 9, color: C.muted }}>
                Status: <span style={{ color: '#ffd60a' }}>{status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
