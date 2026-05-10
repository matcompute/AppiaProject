import React, { useState, useRef, useCallback, useEffect } from 'react'

const CARBON_COLOR = (v) => {
  if (v < 50)  return '#00ff9d'
  if (v < 150) return '#ffd60a'
  if (v < 300) return '#ff9500'
  return '#ff3b30'
}

const NODE_TYPE_ICON = { edge: '◆', core: '●', dc: '▣' }

// Animated traffic dot moving along a link
function TrafficDot({ x1, y1, x2, y2, color, delay = 0, duration = 3 }) {
  return (
    <circle r="0.7" fill={color} opacity="0.9">
      <animateMotion
        dur={`${duration}s`}
        repeatCount="indefinite"
        begin={`${delay}s`}
        path={`M${x1},${y1} L${x2},${y2}`}
      />
      <animate attributeName="opacity" values="0;1;1;0" dur={`${duration}s`} repeatCount="indefinite" begin={`${delay}s`} />
    </circle>
  )
}

export default function NetworkMap({ nodes: initialNodes, links, sfcs, selectedNode, onSelectNode }) {
  // Local node positions — draggable
  const [positions, setPositions] = useState(() =>
    Object.fromEntries(initialNodes.map(n => [n.node_id, { x: n.mapX, y: n.mapY }]))
  )
  const [hovered, setHovered] = useState(null)
  const [dragging, setDragging] = useState(null)   // { nodeId, offsetX, offsetY }
  const svgRef = useRef(null)

  // Only add positions for brand-new nodes — never overwrite positions the user has dragged
  const seenNodes = useRef(new Set(initialNodes.map(n => n.node_id)))
  useEffect(() => {
    initialNodes.forEach(n => {
      if (!seenNodes.current.has(n.node_id)) {
        seenNodes.current.add(n.node_id)
        setPositions(prev => ({ ...prev, [n.node_id]: { x: n.mapX, y: n.mapY } }))
      }
    })
  }, [initialNodes])

  // Build node map (data, not positions)
  const nodeMap = Object.fromEntries(initialNodes.map(n => [n.node_id, n]))

  // SFC count per node
  const sfcCount = {}
  sfcs.forEach(s => { if (s.assigned_node) sfcCount[s.assigned_node] = (sfcCount[s.assigned_node] || 0) + 1 })

  // ── Drag handlers ─────────────────────────────────────────────────────────
  // Use getBoundingClientRect for reliable screen→SVG coordinate mapping
  const VIEW_W = 100
  const VIEW_H = 95

  const screenToSVG = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width)  * VIEW_W,
      y: ((clientY - rect.top)  / rect.height) * VIEW_H,
    }
  }, [])

  const getClient = (e) => e.touches
    ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
    : { clientX: e.clientX, clientY: e.clientY }

  const onNodeMouseDown = useCallback((e, nodeId) => {
    e.preventDefault()
    e.stopPropagation()
    const { clientX, clientY } = getClient(e)
    const svgPt = screenToSVG(clientX, clientY)
    const pos = positions[nodeId]
    setDragging({ nodeId, offsetX: svgPt.x - pos.x, offsetY: svgPt.y - pos.y })
  }, [positions, screenToSVG])

  const onMouseMove = useCallback((e) => {
    if (!dragging) return
    e.preventDefault()
    const { clientX, clientY } = getClient(e)
    const svgPt = screenToSVG(clientX, clientY)
    setPositions(prev => ({
      ...prev,
      [dragging.nodeId]: {
        x: Math.max(6, Math.min(94, svgPt.x - dragging.offsetX)),
        y: Math.max(6, Math.min(88, svgPt.y - dragging.offsetY)),
      }
    }))
  }, [dragging, screenToSVG])

  const onMouseUp = useCallback(() => setDragging(null), [])

  return (
    <div className="appia-card relative overflow-hidden" style={{ height: '100%', minHeight: 440 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: '1px solid var(--appia-border)' }}>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--appia-accent)', fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
            NETWORK TOPOLOGY
          </span>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--appia-accent2)', display: 'inline-block' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>✥ Drag nodes to reposition</span>
          <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>LIVE — Digital Twin</span>
        </div>
      </div>

      {/* SVG Map */}
      <svg
        ref={svgRef}
        viewBox="0 0 100 95"
        style={{ width: '100%', height: 'calc(100% - 44px)', cursor: dragging ? 'grabbing' : 'default', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchMove={onMouseMove}
        onTouchEnd={onMouseUp}
      >
        <defs>
          {/* Grid */}
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(20,35,60,0.7)" strokeWidth="0.2"/>
          </pattern>
          {/* Glow filters */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-strong" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.8" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="text-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Link gradient */}
          <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#00ff9d" stopOpacity="0.8"/>
          </linearGradient>
        </defs>

        {/* Background */}
        <rect width="100" height="95" fill="#080c14" />
        <rect width="100" height="95" fill="url(#grid)" />

        {/* ── Continent shapes (Europe + Africa) ────────────────────────── */}
        {/* Scandinavia */}
        <path d="M30,5 Q36,4 38,8 Q40,12 38,18 Q36,22 34,24 Q30,22 28,18 Q27,13 28,8 Z"
          fill="rgba(15,28,55,0.6)" stroke="rgba(30,55,90,0.5)" strokeWidth="0.3"/>
        {/* Denmark/Germany blob */}
        <path d="M38,22 Q48,20 54,24 Q58,28 56,36 Q54,42 50,44 Q44,45 40,42 Q36,38 36,32 Q36,26 38,22 Z"
          fill="rgba(15,28,55,0.55)" stroke="rgba(30,55,90,0.45)" strokeWidth="0.3"/>
        {/* France/Italy blob */}
        <path d="M38,42 Q46,40 54,44 Q58,50 56,60 Q52,66 46,66 Q40,64 38,58 Q36,52 36,46 Z"
          fill="rgba(15,28,55,0.5)" stroke="rgba(30,55,90,0.4)" strokeWidth="0.3"/>
        {/* Africa (Horn + East) */}
        <path d="M56,65 Q68,62 76,68 Q82,75 80,85 Q76,92 68,93 Q60,92 58,85 Q55,78 56,70 Z"
          fill="rgba(15,28,50,0.45)" stroke="rgba(30,55,85,0.35)" strokeWidth="0.3"/>
        {/* Mediterranean sea hint */}
        <path d="M36,62 Q50,60 62,64 Q66,66 64,68 Q50,66 38,68 Z"
          fill="rgba(0,40,80,0.3)"/>

        {/* ── Network links ──────────────────────────────────────────────── */}
        {links.map((link, i) => {
          const fromPos = positions[link.from]
          const toPos   = positions[link.to]
          if (!fromPos || !toPos) return null
          const from = nodeMap[link.from]
          const to   = nodeMap[link.to]
          if (!from || !to) return null

          const hasSfcs = sfcs.some(s =>
            s.assigned_node === link.from || s.assigned_node === link.to
          )
          const x1 = fromPos.x, y1 = fromPos.y
          const x2 = toPos.x,   y2 = toPos.y

          // Midpoint for arc
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2 - 3

          // Latency-based link color: green (<20ms) → yellow (<50ms) → orange (<100ms) → red
          const latency = link.latency_ms || link.base_latency_ms || 10
          const linkColor = latency < 20 ? '#00ff9d' : latency < 50 ? '#ffd60a' : latency < 100 ? '#ff9500' : '#ff3b30'
          const linkOpacity = hasSfcs ? 0.75 : 0.35
          const strokeW = hasSfcs ? 0.55 : 0.28

          return (
            <g key={i}>
              {/* Shadow / glow line */}
              {hasSfcs && (
                <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                  fill="none" stroke={`${linkColor}22`} strokeWidth="2.8" filter="url(#glow)"/>
              )}
              {/* Main link — color encodes latency, width encodes traffic */}
              <path
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                fill="none"
                stroke={hasSfcs ? linkColor : 'rgba(20,50,80,0.8)'}
                strokeWidth={strokeW}
                strokeDasharray={hasSfcs ? 'none' : '0.8 1.2'}
                strokeOpacity={linkOpacity}
              />
              {/* Animated traffic dots for active links */}
              {hasSfcs && (
                <>
                  <TrafficDot x1={x1} y1={y1} x2={x2} y2={y2} color={linkColor} delay={0}   duration={2.5 + i * 0.3} />
                  <TrafficDot x1={x1} y1={y1} x2={x2} y2={y2} color="#00ff9d"   delay={1.2} duration={2.5 + i * 0.3} />
                </>
              )}
              {/* Latency + bandwidth label at midpoint */}
              <text x={mx} y={my - 1.5} textAnchor="middle" fontSize="1.5" fill={`${linkColor}99`}>
                {latency}ms · {link.bandwidth_gbps}G
              </text>
            </g>
          )
        })}

        {/* ── Nodes ──────────────────────────────────────────────────────── */}
        {initialNodes.map((node) => {
          const pos = positions[node.node_id]
          if (!pos) return null
          const isSelected = selectedNode === node.node_id
          const isHovered  = hovered === node.node_id
          const isDragging = dragging?.nodeId === node.node_id
          const color = CARBON_COLOR(node.carbon_intensity)
          const count = sfcCount[node.node_id] || 0
          const nodeType = node.node_type || node.type || 'edge'
          const r = nodeType === 'dc' ? 3.2 : nodeType === 'core' ? 2.8 : 2.4

          return (
            <g
              key={node.node_id}
              style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
              onMouseEnter={() => setHovered(node.node_id)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Outer pulse ring (selected or hovered) */}
              {(isSelected || isHovered) && !isDragging && (
                <circle cx={pos.x} cy={pos.y} r={r + 3}
                  fill="none" stroke={color} strokeWidth="0.4" opacity="0.35"
                  className="node-ping" />
              )}

              {/* Active glow halo */}
              <circle cx={pos.x} cy={pos.y} r={r + 1.8}
                fill={`${color}08`}
                stroke={color} strokeWidth="0.25" opacity="0.6"
                filter="url(#glow)" />

              {/* Main filled circle */}
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={isSelected ? `${color}33` : `${color}12`}
                stroke={color}
                strokeWidth={isSelected ? 0.7 : 0.45}
                filter={isSelected ? 'url(#glow-strong)' : 'url(#glow)'}
              />

              {/* Inner node type icon */}
              <text x={pos.x} y={pos.y + 0.7} textAnchor="middle"
                fontSize={node.type === 'dc' ? 2.5 : 2}
                fill={isSelected ? color : `${color}cc`} fontWeight="bold">
                {NODE_TYPE_ICON[node.type]}
              </text>

              {/* SFC count badge */}
              {count > 0 && (
                <g>
                  <circle cx={pos.x + r * 0.85} cy={pos.y - r * 0.85} r={1.5}
                    fill="var(--appia-accent)" stroke="#080c14" strokeWidth="0.3" />
                  <text x={pos.x + r * 0.85} y={pos.y - r * 0.85 + 0.6}
                    textAnchor="middle" fontSize="1.4" fill="#000" fontWeight="bold">
                    {count}
                  </text>
                </g>
              )}

              {/* Node name label */}
              <text x={pos.x} y={pos.y + r + 3.2}
                textAnchor="middle" fontSize="2.1"
                fill={isSelected ? color : 'rgba(232,240,254,0.92)'}
                fontWeight={isSelected ? '700' : '500'}
                filter={isSelected ? 'url(#text-glow)' : undefined}>
                {node.flag} {node.name}
              </text>

              {/* Carbon value */}
              <text x={pos.x} y={pos.y + r + 5.8}
                textAnchor="middle" fontSize="1.7"
                fill={color} fontWeight="600"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {Math.round(node.carbon_intensity)} gCO₂/kWh
              </text>

              {/* Cost label (show on hover or select) */}
              {(isHovered || isSelected) && (
                <text x={pos.x} y={pos.y + r + 8.2}
                  textAnchor="middle" fontSize="1.5"
                  fill="rgba(0,212,255,0.9)" fontWeight="500"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  €{node.energy_cost.toFixed(3)}/kWh
                </text>
              )}

              {/* Battery indicator */}
              {node.battery_level > 0 && (
                <g>
                  <rect x={pos.x - 3} y={pos.y + r + 9.8} width={6} height={1.2}
                    fill="rgba(255,255,255,0.06)" rx="0.6" />
                  <rect x={pos.x - 3} y={pos.y + r + 9.8}
                    width={6 * node.battery_level} height={1.2}
                    fill={node.battery_level > 0.4 ? '#00ff9d' : '#ff3b30'} rx="0.6" />
                </g>
              )}

              {/* ── DRAG HIT AREA — transparent circle, always on top ────────
                  This is the definitive pointer-event target for the whole node.
                  Covers the entire visible node area so any click/drag anywhere
                  on the node (inner circle, icon, label) works perfectly.      */}
              <circle
                cx={pos.x} cy={pos.y}
                r={r + 8}
                fill="transparent"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onNodeMouseDown(e, node.node_id) }}
                onTouchStart={(e) => { e.preventDefault(); onNodeMouseDown(e, node.node_id) }}
                onClick={(e) => { e.stopPropagation(); if (!isDragging) onSelectNode(node.node_id === selectedNode ? null : node.node_id) }}
              />
            </g>
          )
        })}

        {/* ── Coordinates hint ─────────────────────────────────�