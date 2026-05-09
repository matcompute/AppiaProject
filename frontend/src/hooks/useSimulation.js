/**
 * Appia — useSimulation hook
 * Tries to connect to the FastAPI backend.
 * Falls back to local JS simulation if backend is offline.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { NODES, SFCS, CARBON_HISTORY } from '../data/mockData'

const API_BASE = '/api'

export function useSimulation() {
  const [nodes, setNodes] = useState(NODES)
  const [sfcs] = useState(SFCS)
  const [hour, setHour] = useState(9)
  const [source, setSource] = useState('simulation') // 'simulation' | 'live'
  const [isRunning, setIsRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const timerRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Try to connect to backend SSE stream
  useEffect(() => {
    const tryLive = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
        if (res.ok) {
          setSource('live')
          const es = new EventSource(`${API_BASE}/events`)
          es.onmessage = (e) => {
            const data = JSON.parse(e.data)
            setNodes(data.nodes)
            setHour(data.hour)
          }
          es.onerror = () => {
            es.close()
            setSource('simulation')
          }
          eventSourceRef.current = es
        }
      } catch {
        setSource('simulation')
      }
    }
    tryLive()
    return () => eventSourceRef.current?.close()
  }, [])

  // Local simulation tick (used when backend is offline)
  const localTick = useCallback(() => {
    setHour(h => (h + 1) % 24)
    setNodes(prev => prev.map(node => {
      const base_c = { 'NO-OSLO-01': 25, 'DK-CPH-01': 120, 'IT-MIL-01': 280, 'DE-FRA-01': 320, 'ET-ADD-01': 30 }[node.node_id] || 200
      const base_p = { 'NO-OSLO-01': 0.04, 'DK-CPH-01': 0.12, 'IT-MIL-01': 0.22, 'DE-FRA-01': 0.18, 'ET-ADD-01': 0.05 }[node.node_id] || 0.15
      const peak = (hour >= 8 && hour <= 10) || (hour >= 18 && hour <= 20) ? 1.25 : hour <= 5 ? 0.75 : 1.0
      return {
        ...node,
        carbon_intensity: Math.max(5, Math.round(base_c * peak + (Math.random() - 0.5) * base_c * 0.08)),
        energy_cost: parseFloat(Math.max(0.005, base_p * peak + (Math.random() - 0.5) * 0.005).toFixed(4)),
        cpu_load: Math.max(0, Math.min(1, node.cpu_load + (Math.random() - 0.5) * 0.04)),
      }
    }))
  }, [hour])

  useEffect(() => {
    if (source === 'live') return // Backend handles ticks
    if (isRunning) {
      timerRef.current = setInterval(localTick, 1500 / speed)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning, speed, source, localTick])

  const reset = useCallback(async () => {
    setIsRunning(false)
    setHour(9)
    setNodes(NODES)
    if (source === 'live') {
      try { await fetch(`${API_BASE}/reset`, { method: 'POST' }) } catch {}
    }
  }, [source])

  const step = useCallback(async () => {
    if (source === 'live') {
      try {
        const res = await fetch(`${API_BASE}/step`, { method: 'POST' })
        const data = await res.json()
        setNodes(data.nodes)
        setHour(data.hour)
      } catch { localTick() }
    } else {
      localTick()
    }
  }, [source, localTick])

  return {
    nodes, sfcs, hour, isRunning, speed, source,
    carbonHistory: CARBON_HISTORY,
    setIsRunning, setSpeed,
    reset, step,
  }
}
