/**
 * Appia — AI Advisor Panel
 * Powered by Google Gemini 2.0 Flash via the Spring Boot backend.
 * Operator asks free-form questions; gets natural-language answers about the network.
 */
import React, { useState, useEffect, useRef } from 'react'

const BASE = '/api/v1/advisor'

const SUGGESTED = [
  'What happens if Frankfurt loses power right now?',
  'Which node should I power down to save the most CO₂ tonight?',
  'Are any critical services at SLA risk?',
  'What is the current network health summary?',
  'How can I reduce carbon emissions by 20%?',
]

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #00d4ff, #0066cc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, marginRight: 8, marginTop: 2,
        }}>⬡</div>
      )}
      <div style={{
        maxWidth: '78%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser
          ? 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,102,204,0.18))'
          : 'rgba(255,255,255,0.05)',
        border: `1px solid ${isUser ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
        color: 'var(--appia-text)',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
      }}>
        {msg.text}
        {msg.loading && (
          <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6, verticalAlign: 'middle' }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--appia-accent)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                display: 'inline-block',
              }}/>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({ text, index }) {
  const colors = ['#00ff9d', '#ffd60a', '#00d4ff']
  const icons  = ['⚡', '⚠', 'ℹ']
  const labels = ['ACTION REQUIRED', 'ADVISORY', 'INFO']
  const color  = colors[index % 3]

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, marginBottom: 8,
      background: `rgba(${index === 0 ? '0,255,157' : index === 1 ? '255,214,10' : '0,212,255'},0.06)`,
      border: `1px solid ${color}33`,
    }}>
      <div style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {icons[index % 3]} {labels[index % 3]}
      </div>
      <div style={{ fontSize: 12, color: 'var(--appia-text)', lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

export default function AskAppia() {
  const [messages,        setMessages]        = useState([])
  const [input,           setInput]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [recommendations, setRecommendations] = useState(null)
  const [recsLoading,     setRecsLoading]     = useState(false)
  const [cooldown,        setCooldown]        = useState(0)
  const bottomRef = useRef(null)

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const loadRecommendations = () => {
    if (recsLoading || cooldown > 0) return
    setRecsLoading(true)
    fetch(`${BASE}/recommendations`)
      .then(r => r.json())
      .then(data => {
        const raw = data.recommendations || ''
        if (raw.includes('429') || raw.includes('rate limit')) {
          setCooldown(60)
          setRecommendations(['Rate limit hit — please wait a moment and try again.'])
        } else {
          const lines = raw.split('\n').filter(l => l.trim())
          setRecommendations(lines)
        }
      })
      .catch(() => setRecommendations(['Backend not reachable — is Spring Boot running?']))
      .finally(() => setRecsLoading(false))
  }

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendQuestion = async (question) => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setMessages(prev => [...prev, { role: 'appia', text: '', loading: true }])
    setLoading(true)

    try {
      const res = await fetch(`${BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'appia', text: data.answer || 'No response from AI advisor.' },
      ])
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'appia', text: 'AI Advisor is offline. Make sure the Spring Boot backend is running.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(input) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, height: 'calc(100vh - 160px)' }}>

      {/* ── Left: Chat ───────────────────────────────────────────────────────── */}
      <div className="appia-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--appia-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00d4ff, #0066cc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>⬡</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--appia-text)' }}>Ask Appia</div>
            <div style={{ fontSize: 11, color: 'var(--appia-muted)' }}>
              Powered by Gemini 2.0 Flash · Green Network AI Advisor
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff9d' }}/>
            <span style={{ fontSize: 10, color: '#00ff9d' }}>ONLINE</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⬡</div>
              <div style={{ fontSize: 14, color: 'var(--appia-text)', marginBottom: 6 }}>
                Ask me anything about your network
              </div>
              <div style={{ fontSize: 12, color: 'var(--appia-muted)', marginBottom: 24 }}>
                Scenario analysis · SLA risk · Carbon optimization · What-if questions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, margin: '0 auto' }}>
                {SUGGESTED.map((q, i) => (
                  <button key={i} onClick={() => sendQuestion(q)} style={{
                    padding: '8px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
                    color: 'var(--appia-muted)', fontSize: 12, lineHeight: 1.4,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.target.style.color = 'var(--appia-text)'; e.target.style.borderColor = 'rgba(0,212,255,0.4)' }}
                  onMouseLeave={e => { e.target.style.color = 'var(--appia-muted)'; e.target.style.borderColor = 'rgba(0,212,255,0.2)' }}
                  >
                    💬 {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--appia-border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your network... (Enter to send)"
              rows={2}
              disabled={loading}
              style={{
                flex: 1, resize: 'none', padding: '10px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--appia-border)',
                borderRadius: 8, color: 'var(--appia-text)', fontSize: 13,
                fontFamily: 'inherit', outline: 'none',
                opacity: loading ? 0.6 : 1,
              }}
            />
            <button
              onClick={() => sendQuestion(input)}
              disabled={loading || !input.trim()}
              style={{
                padding: '0 18px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                background: loading || !input.trim()
                  ? 'rgba(0,212,255,0.1)'
                  : 'linear-gradient(135deg, #00d4ff, #0066cc)',
                border: 'none', color: '#fff', fontSize: 18, fontWeight: 700,
                opacity: loading || !input.trim() ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >➤</button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--appia-muted)', marginTop: 6 }}>
            Shift+Enter for new line · Responses are AI-generated network analysis
          </div>
        </div>
      </div>

      {/* ── Right: Proactive Recommendations ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="appia-card" style={{ flex: 1 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--appia-accent)',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>◈</span> Live Recommendations
          </div>

          {!recommendations && !recsLoading && (
            <button
              onClick={loadRecommendations}
              disabled={cooldown > 0}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                color: cooldown > 0 ? 'var(--appia-muted)' : 'var(--appia-accent)',
                fontSize: 12, fontWeight: 600,
              }}
            >
              {cooldown > 0 ? `Rate limited — retry in ${cooldown}s` : '⚡ Analyze Network Now'}
            </button>
          )}
          {recsLoading && (
            <div style={{ color: 'var(--appia-muted)', fontSize: 12 }}>
              Analyzing network state with Gemini...
            </div>
          )}
          {recommendations && !recsLoading && (
            <>
              {recommendations.filter(l => l.trim()).map((line, i) => (
                <RecommendationCard key={i} text={line.replace(/^\d+\.\s*/, '').replace(/^\[.*?\]\s*/, '')} index={i} />
              ))}
              <button
                onClick={loadRecommendations}
                disabled={cooldown > 0 || recsLoading}
                style={{
                  marginTop: 8, width: '100%', padding: '6px 10px', borderRadius: 6,
                  cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                  background: 'transparent', border: '1px solid var(--appia-border)',
                  color: 'var(--appia-muted)', fontSize: 10,
                }}
              >
                {cooldown > 0 ? `Retry in ${cooldown}s` : '↻ Refresh'}
              </button>
            </>
          )}
        </div>

        {/* Quick ask buttons */}
        <div className="appia-card">
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--appia-accent)',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
          }}>
            ⚡ Quick Analysis
          </div>
          {[
            { label: '🌩 Power Outage', q: 'What happens if Frankfurt loses power right now?' },
            { label: '🌿 Carbon Cut', q: 'Which nodes should I power down to save the most CO₂ tonight?' },
            { label: '🚨 SLA Risk',   q: 'Which critical services are at risk of SLA violation?' },
            { label: '🔋 Battery',    q: 'What is the current battery and renewable energy status in Addis Ababa?' },
          ].map(({ label, q }) => (
            <button key={label} onClick={() => sendQuestion(q)} style={{
              display: 'block', width: '100%', marginBottom: 6,
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--appia-border)',
              color: 'var(--appia-muted)', fontSize: 11, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--appia-text)'; e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--appia-muted)'; e.currentTarget.style.borderColor = 'var(--appia-border)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyframe animation for loading dots */}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
