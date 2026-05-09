/**
 * Appia — useBackend hook
 * Connects to the Spring Boot backend at /api/v1
 * Maps camelCase Java fields → snake_case React component props
 * Polls every 5 seconds for live node telemetry.
 */
import { useState, useEffect, useCallback } from 'react'
import { NODES, SFCS, LINKS } from '../data/mockData'

const BASE = '/api/v1'

// Flag emojis by location code
const FLAGS = { NO: '🇳🇴', DK: '🇩🇰', IT: '🇮🇹', DE: '🇩🇪', ET: '🇪🇹' }

function mapNode(n) {
  return {
    node_id:          n.nodeId,
    name:             n.name,
    location_code:    n.locationCode,
    flag:             FLAGS[n.locationCode] || '🌍',
    node_type:        n.nodeType,
    status:           n.status,
    latitude:         n.latitude,
    longitude:        n.longitude,
    // Energy (Pct 0-100 in Java → 0-1 in React)
    carbon_intensity: n.carbonIntensityGco2Kwh,
    energy_cost:      n.energyCostEurKwh,
    battery_level:    n.batteryLevelPct >= 0 ? n.batteryLevelPct / 100 : -1,
    has_renewable:    n.hasRenewable,
    has_battery:      n.hasBattery,
    // Load (Pct 0-100 → 0-1)
    cpu_load:         (n.cpuLoadPct    || 0) / 100,
    memory_load:      (n.memoryLoadPct || 0) / 100,
    bw_load:          (n.bwLoadPct     || 0) / 100,
    // Capacity
    cpu_cores:        n.cpuCapacityCores,
    memory_gb:        n.memoryCapacityGb,
    bandwidth_gbps:   n.maxBandwidthGbps,
  }
}

function mapSfc(s) {
  return {
    sfc_id:          s.id,
    name:            s.name,
    priority:        s.priority,
    assigned_node:   s.assignedNode?.nodeId || null,
    latency_ms:      s.currentLatencyMs || 0,
    max_latency_ms:  s.maxLatencyMs || 100,
    sla_ok:          !s.slaViolated,
    vnf_chain:       s.vnfChain || [],
    deployment_model: s.deploymentModel,
    k8s_namespace:   s.k8sNamespace,
  }
}

export function useBackend() {
  const [nodes,    setNodes]    = useState(null)   // null = not loaded yet
  const [sfcs,     setSfcs]     = useState(null)
  const [isOnline, setIsOnline] = useState(false)
  const [error,    setError]    = useState(null)

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/nodes`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNodes(data.map(mapNode))
      setIsOnline(true)
      setError(null)
    } catch (e) {
      setIsOnline(false)
      setError(e.message)
    }
  }, [])

  const fetchSfcs = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/sfcs`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSfcs(data.map(mapSfc))
    } catch { /* SFCs optional */ }
  }, [])

  // Initial load + poll every 5s
  useEffect(() => {
    fetchNodes()
    fetchSfcs()
    const interval = setInterval(() => { fetchNodes(); fetchSfcs() }, 5000)
    return () => clearInterval(interval)
  }, [fetchNodes, fetchSfcs])

  return {
    // If backend is online use live data, otherwise fall back to mock
    nodes:    nodes    || NODES,
    sfcs:     sfcs     || SFCS,
    links:    LINKS,
    isOnline,
    error,
    refresh:  () => { fetchNodes(); fetchSfcs() },
  }
}
