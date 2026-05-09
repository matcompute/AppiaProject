import React from 'react'

export default function SimulationControls({ hour, isRunning, onToggle, onReset, onStep, speed, onSpeedChange, source }) {
  const hourStr = `${String(Math.floor(hour)).padStart(2, '0')}:00`
  const timeOfDay =
    hour >= 6 && hour < 12 ? '🌅 Morning' :
    hour >= 12 && hour < 18 ? '☀️ Afternoon' :
    hour >= 18 && hour < 22 ? '🌆 Evening' : '🌙 Night'

  return (
    <div className="appia-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'linear-gradient(135deg, #00d4ff, #00ff9d)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 900, color: '#000'
        }}>A</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--appia-text)', letterSpacing: 1 }}>APPIA</div>
          <div style={{ fontSize: 9, color: 'var(--appia-muted)', letterSpacing: 2 }}>DIGITAL TWIN</div>
        </div>
      </div>

      <div style={{ width: 1, height: 32, background: 'var(--appia-border)' }} />

      {/* Time display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--appia-accent)', lineHeight: 1 }}>
            {hourStr}
          </div>
          <div style={{ fontSize: 10, color: 'var(--appia-muted)' }}>{timeOfDay}</div>
        </div>
        {/* Time bar */}
        <div style={{ width: 120 }}>
          <div className="gauge-track" style={{ height: 6 }}>
            <div className="gauge-fill" style={{
              width: `${(hour / 24) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #00d4ff, #00ff9d)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--appia-muted)', marginTop: 2 }}>
            <span>00:00</span><span>12:00</span><span>24:00</span>
          </div>
        </div>
      </div>

      <div style={{ width: 1, height: 32, background: 'var(--appia-border)' }} />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={onReset} style={{
          padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          background: 'transparent', color: 'var(--appia-muted)',
          border: '1px solid var(--appia-border)',
        }}>↺ Reset</button>

        <button onClick={onStep} disabled={isRunning} style={{
          padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          background: 'rgba(0,212,255,0.1)', color: 'var(--appia-accent)',
          border: '1px solid rgba(0,212,255,0.3)',
          opacity: isRunning ? 0.4 : 1,
        }}>+1h Step</button>

        <button onClick={onToggle} style={{
          padding: '6px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: isRunning ? 'rgba(255,59,48,0.15)' : 'rgba(0,255,157,0.15)',
          color: isRunning ? '#ff3b30' : '#00ff9d',
          border: `1px solid ${isRunning ? 'rgba(255,59,48,0.4)' : 'rgba(0,255,157,0.4)'}`,
        }}>
          {isRunning ? '⏹ Stop' : '▶ Run'}
        </button>
      </div>

      <div style={{ width: 1, height: 32, background: 'var(--appia-border)' }} />

      {/* Speed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>Speed:</span>
        {[1, 2, 4].map(s => (
          <button key={s} onClick={() => onSpeedChange(s)} style={{
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
            background: speed === s ? 'rgba(0,212,255,0.15)' : 'transparent',
            color: speed === s ? 'var(--appia-accent)' : 'var(--appia-muted)',
            border: `1px solid ${speed === s ? 'rgba(0,212,255,0.4)' : 'var(--appia-border)'}`,
          }}>{s}×</button>
        ))}
      </div>

      {/* Data source */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: source === 'live' ? '#00ff9d' : '#ffd60a',
        }} className={source === 'live' ? 'pulse-dot' : ''} />
        <span style={{ fontSize: 10, color: 'var(--appia-muted)' }}>
          {source === 'live' ? 'LIVE API' : 'SIMULATION'}
        </span>
      </div>
    </div>
  )
}
