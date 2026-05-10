/**
 * Appia — useBackend hook
 * Connects to the Spring Boot backend at /api/v1
 * Maps camelCase Java fields → snake_case React component props
 *
 * Bug fixes:
 *   ✓ sfc_id now uses s.sfcId ("SFC-BANK-01"), not s.id (DB Long)
 *   ✓ processing_latency_ms added to node map (key MCVP input)
 *   ✓ sla_ok computed locally — never stale between polls
 *   ✓ links fetched live from /api/v1/topology/links
 *   ✓ carbon history from /api/v1/placements/history
 *   ✓ benchmark stats from /api/v1/placements/stats
 */
import { useState, useEffect, useCallback } from 'react'
import { NODES, SFCS, LINKS } from '../data/mockData'

const BASE = '/api/v1'

const FLAGS = { NO: '🇳🇴', DK: '🇩🇰', IT: '🇮🇹', DE: '🇩🇪', ET: '🇪🇹' }

function mapNode(n) {
  return {
    node_id:               n.nodeId,
    name:                  n.name,
    location_code:         n.locationCode,
    flag:                  FLAGS[n.locationCode] || '🌍',
    node_type:             n.nodeType,
    status:                n.status,
    latitude:              n.latitude,
    longitude:             n.longitude,
    // Energy — live telemetry
    carbon_intensity:      n.carbonIntensityGco2Kwh,
    energy_cost:           n.energyCostEurKwh,
    available_power_kw:    n.availablePowerKw,
    battery_level:         n.batteryLevelPct >= 0 ? n.batteryLevelPct / 100 : -1,
    has_renewable:         n.hasRenewable,
    has_battery:           n.hasBattery,
    has_backup_generator:  n.hasBackupGenerator,
    // Load (0-100 → 0-1)
    cpu_load:              (n.cpuLoadPct    || 0) / 100,
    memory_load:           (n.memoryLoadPct || 0) / 100,
    bw_load:               (n.bwLoadPct     || 0) / 100,
    // Capacity + latency (MCVP inputs — both needed for placement scoring)
    cpu_cores:             n.cpuCapacityCores,
    memory_gb:             n.memoryCapacityGb,
    bandwidth_gbps:        n.maxBandwidthGbps,
    processing_latency_ms: n.processingLatencyMs || 0,
  }
}

function mapSfc(s) {
  const latency    = s.currentLatencyMs || 0
  const maxLatency = s.maxLatencyMs     || 100
  return {
    sfc_id:             s.sfcId,                    // FIX: real string ID not DB Long
    name:               s.name,
    description:        s.description,
    priority:           s.priority,
    status:             s.status,
    assigned_node:      s.assignedNode?.nodeId || null,
    latency_ms:         latency,
    max_latency_ms:     maxLatency,
    sla_ok:             latency <= maxLatency && s.status !== 'SHED', // FIX: computed locally
    sla_violation_count: s.slaViolationCount || 0,
    vnf_chain:          s.vnfChain || [],
    deployment_model:   s.deploymentModel,
    k8s_namespace:      s.k8sNamespace,
    replica_count:      s.replicaCount || 1,
    cpu_required:       s.cpuRequiredCores,
    memory_required:    s.memoryRequiredGb,
    bandwidth_required: s.bandwidthRequiredGbps,
  }
}

export function useBackend() {
  const [nodes,          setNodes]          = useState(null)
  const [sfcs,           setSfcs]           = useState(null)
  const [links,          setLinks]          = useState(null)
  const [carbonHistory,  setCarbonHistory]  = useState(null)
  const [benchmarkStats, setBenchmarkStats] = useState(null)
  const [isOnline, 