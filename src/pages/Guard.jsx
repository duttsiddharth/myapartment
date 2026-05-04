import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useCallStatusUpdate, useEmergencyAlerts, useAnnouncements } from '../hooks/useRealtime'
import Icon from '../components/Icons'

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
const fmtTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function GuardPage() {
  const { user, profile, signOut } = useAuth()
  const [tab, setTab]               = useState('call')
  const [flats, setFlats]           = useState([])
  const [visitorLog, setVisitorLog] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [emergencies, setEmergencies] = useState([])
  const [searchQ, setSearchQ]       = useState('')
  const [selectedBlock, setSelectedBlock] = useState('A')
  const [visitorName, setVisitorName] = useState('')
  const [visitorPurpose, setVisitorPurpose] = useState('')
  const [visitorFlatId, setVisitorFlatId] = useState('')
  const [activeCall, setActiveCall] = useState(null)   // call row from DB
  const [callTimer, setCallTimer]   = useState(0)
  const [annText, setAnnText]       = useState('')
  const [annType, setAnnType]       = useState('info')
  const [aiMessages, setAiMessages] = useState([{ role: 'assistant', content: 'Hi! I\'m SecureAI. Ask me about any flat, visitor procedure, or security policy.' }])
  const [aiInput, setAiInput]       = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const timerRef   = useRef(null)
  const aiEndRef   = useRef(null)

  // Load data
  useEffect(() => {
    loadFlats(); loadVisitorLog(); loadAnnouncements(); loadEmergencies()
    setVisitorFlatId('A-101')
  }, [])

  const loadFlats = async () => {
    const { data } = await supabase.from('flats').select('*').order('floor').order('id')
    setFlats(data || [])
  }
  const loadVisitorLog = async () => {
    const { data } = await supabase.from('visitor_log').select('*').order('created_at', { ascending: false }).limit(60)
    setVisitorLog(data || [])
  }
  const loadAnnouncements = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(30)
    setAnnouncements(data || [])
  }
  const loadEmergencies = async () => {
    const { data } = await supabase.from('emergency_alerts').select('*').order('created_at', { ascending: false }).limit(20)
    setEmergencies(data || [])
  }

  // Realtime — watch call status updates
  useCallStatusUpdate(activeCall?.id, async (updated) => {
    setActiveCall(updated)
    if (['allowed', 'denied', 'ended', 'missed'].includes(updated.status)) {
      clearInterval(timerRef.current)
      setCallTimer(0)
      if (updated.status === 'allowed' || updated.status === 'denied') {
        await logVisitorEntry(updated.flat_id, updated.status, updated.id)
        setActiveCall(null)
        loadVisitorLog()
      }
    }
  })

  // Realtime — emergency alerts
  useEmergencyAlerts('guard', (alert) => {
    setEmergencies(prev => [alert, ...prev])
    if (tab !== 'log') setTab('log')
  })

  // Realtime — announcements
  useAnnouncements((ann) => setAnnouncements(prev => [ann, ...prev]))

  // Call timer
  useEffect(() => {
    if (activeCall?.status === 'connected') {
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [activeCall?.status])

  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiMessages])

  // ── Actions ──────────────────────────────────────────────────────────

  const initiateCall = async (flat) => {
    if (activeCall) return
    const { data, error } = await supabase.from('calls').insert({
      flat_id: flat.id,
      resident_name: flat.resident_name,
      visitor_name: visitorName || 'Visitor',
      visitor_purpose: visitorPurpose || 'Visit',
      status: 'ringing',
      initiated_by: user.id,
    }).select().single()
    if (!error) setActiveCall(data)
  }

  const endCall = async () => {
    if (!activeCall) return
    await supabase.from('calls').update({ status: 'ended' }).eq('id', activeCall.id)
    setActiveCall(null)
    clearInterval(timerRef.current)
    setCallTimer(0)
  }

  const logVisitorEntry = async (flatId, status, callId = null) => {
    const flat = flats.find(f => f.id === (flatId || visitorFlatId))
    await supabase.from('visitor_log').insert({
      visitor_name: visitorName || 'Visitor',
      purpose: visitorPurpose || 'Visit',
      flat_id: flat?.id || visitorFlatId,
      resident_name: flat?.resident_name,
      status,
      logged_by: user.id,
    })
    setVisitorName(''); setVisitorPurpose('')
    loadVisitorLog()
  }

  const allowDirectly = async () => {
    setSaving(true)
    await logVisitorEntry(visitorFlatId, 'allowed')
    setSaving(false)
  }
  const denyDirectly = async () => {
    setSaving(true)
    await logVisitorEntry(visitorFlatId, 'denied')
    setSaving(false)
  }

  const sendAnnouncement = async () => {
    if (!annText.trim()) return
    setSaving(true)
    await supabase.from('announcements').insert({
      text: annText.trim(), type: annType, created_by: user.id, created_by_name: profile?.name || 'Guard'
    })
    setAnnText('')
    setSaving(false)
    loadAnnouncements()
  }

  const acknowledgeAlert = async (id) => {
    await supabase.from('emergency_alerts').update({ acknowledged: true, acknowledged_by: user.id, acknowledged_at: new Date().toISOString() }).eq('id', id)
    loadEmergencies()
  }

  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return
    const msg = aiInput.trim(); setAiInput('')
    setAiMessages(prev => [...prev, { role: 'user', content: msg }])
    setAiLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: `You are SecureAI, the intelligent security assistant for MyApartment — 200 flats across 4 blocks (A-D), 10 floors, 5 units each. Help the security guard with visitor management, flat info, and security procedures. Total visitors today: ${visitorLog.length}. Active emergencies: ${emergencies.filter(e => !e.acknowledged).length}. Be concise and practical.`,
          messages: aiMessages.filter((_, i) => i > 0 || aiMessages[0].role !== 'assistant')
                              .concat({ role: 'user', content: msg })
        })
      })
      const data = await res.json()
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.content?.[0]?.text || 'Could not process.' }])
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }])
    }
    setAiLoading(false)
  }

  // ── Derived ──────────────────────────────────────────────────────────
  const filteredFlats = flats.filter(f => {
    if (!searchQ) return true
    const q = searchQ.toLowerCase()
    return f.id.toLowerCase().includes(q) || f.resident_name.toLowerCase().includes(q)
  })

  const unackedEmergencies = emergencies.filter(e => !e.acknowledged).length
  const tabs = [
    { id: 'call', label: 'CALL', icon: 'phone' },
    { id: 'log',  label: 'LOG',  icon: 'log',  badge: unackedEmergencies },
    { id: 'ann',  label: 'ALERTS', icon: 'bell' },
    { id: 'ai',   label: 'AI',   icon: 'bot' },
  ]

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-logo">
          <div className="logo-icon">🏢</div>
          <div>
            <div className="logo-text">{import.meta.env.VITE_SOCIETY_NAME || 'MyApartment'}</div>
            <div className="logo-sub">GUARD · {profile?.name || ''}</div>
          </div>
        </div>
        <div className="header-right">
          {unackedEmergencies > 0 && <span className="pill pill-red pulse">🚨 {unackedEmergencies}</span>}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={signOut} title="Sign Out"><Icon name="logout" size={16} /></button>
        </div>
      </div>

      {/* Active Call Bar */}
      {activeCall && ['ringing', 'connected'].includes(activeCall.status) && (
        <div style={{ padding: '0 16px 0' }}>
          <div className="active-call-bar" style={{ marginTop: 12 }}>
            <Icon name={activeCall.status === 'connected' ? 'mic' : 'phone'} size={18} style={{ color: 'var(--green)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{activeCall.flat_id} — {activeCall.resident_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {activeCall.status === 'connected' ? `Connected · ${fmtTimer(callTimer)}` : '🔔 Ringing — waiting for resident...'}
              </div>
            </div>
            <button className="btn btn-red btn-sm" onClick={endCall}><Icon name="phoneOff" size={14} /></button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="content" style={{ paddingTop: 12 }}>
        {tab === 'call' && (
          <div>
            {/* Stats */}
            <div className="stats-row">
              <div className="stat-card"><div className="stat-num">{visitorLog.length}</div><div className="stat-label">Today</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: 'var(--green)' }}>{visitorLog.filter(v => v.status === 'allowed').length}</div><div className="stat-label">Allowed</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: 'var(--red)' }}>{visitorLog.filter(v => v.status === 'denied').length}</div><div className="stat-label">Denied</div></div>
            </div>

            {/* Visitor Entry */}
            <div className="card">
              <div className="card-title"><Icon name="user" size={16} /> Visitor Entry</div>
              <div className="form-group">
                <label className="form-label">Visitor Name</label>
                <input className="form-input" placeholder="Enter visitor name" value={visitorName} onChange={e => setVisitorName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Purpose</label>
                <select className="form-select" value={visitorPurpose} onChange={e => setVisitorPurpose(e.target.value)}>
                  <option value="">Select purpose</option>
                  {['Delivery','Guest','Service / Repair','Cab / Taxi','Maid / Cook','Salesperson','Other'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Flat to Visit</label>
                <select className="form-select" value={visitorFlatId} onChange={e => setVisitorFlatId(e.target.value)}>
                  {flats.map(f => <option key={f.id} value={f.id}>{f.id} — {f.resident_name}</option>)}
                </select>
              </div>
              <button className="btn btn-amber btn-full" disabled={!!activeCall || saving}
                onClick={() => { const f = flats.find(f => f.id === visitorFlatId); if (f) initiateCall(f) }}>
                <Icon name="phone" size={15} /> Call Flat (Resident Approves)
              </button>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-green btn-sm" style={{ flex: 1 }} disabled={saving} onClick={allowDirectly}><Icon name="check" size={14} /> Allow Directly</button>
                <button className="btn btn-red btn-sm" style={{ flex: 1 }} disabled={saving} onClick={denyDirectly}><Icon name="x" size={14} /> Deny</button>
              </div>
            </div>

            {/* Directory */}
            <div className="card">
              <div className="card-title"><Icon name="search" size={16} /> Flat Directory</div>
              <div className="search-wrap">
                <span className="search-icon"><Icon name="search" size={16} /></span>
                <input className="search-input" placeholder="Search flat number or resident..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {filteredFlats.slice(0, 25).map(flat => (
                  <div key={flat.id} className="flat-item">
                    <div className="flat-badge mono">{flat.id}</div>
                    <div className="flat-info">
                      <div className="flat-name">{flat.resident_name}</div>
                      <div className="flat-meta">Floor {flat.floor}{flat.phone ? ` · ${flat.phone}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Mobile phone call — opens dialer */}
                      {flat.phone && (
                        <a href={`tel:${flat.phone}`}
                          style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--green-dim)', border: '1px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)', textDecoration: 'none' }}
                          title={`Call ${flat.phone}`}>
                          <Icon name="phone" size={15} />
                        </a>
                      )}
                      {/* App intercom call */}
                      <button className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => { setVisitorFlatId(flat.id); initiateCall(flat) }}
                        disabled={!!activeCall}
                        title="Intercom call via app">
                        <Icon name="mic" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                {filteredFlats.length === 0 && <div className="empty">No results found</div>}
              </div>
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div>
            {emergencies.filter(e => !e.acknowledged).length > 0 && (
              <div className="card" style={{ borderColor: 'var(--red)' }}>
                <div className="card-title" style={{ color: 'var(--red)' }}><Icon name="alert" size={16} /> 🚨 Active Emergencies</div>
                {emergencies.filter(e => !e.acknowledged).map(e => (
                  <div key={e.id} className="log-item emergency" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div className="log-main">SOS from {e.flat_id} — {e.resident_name}</div>
                      <div className="log-meta">{fmt(e.created_at)}</div>
                    </div>
                    <button className="btn btn-amber btn-sm" onClick={() => acknowledgeAlert(e.id)}>Ack</button>
                  </div>
                ))}
              </div>
            )}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 0 }}><Icon name="log" size={16} /> Visitor Log</div>
                <button className="btn btn-ghost btn-sm" onClick={loadVisitorLog}><Icon name="refresh" size={14} /></button>
              </div>
              {visitorLog.length === 0 && <div className="empty">No visitors logged today</div>}
              {visitorLog.map(v => (
                <div key={v.id} className={`log-item ${v.status}`}>
                  <div className={`log-dot ${v.status === 'allowed' ? 'green' : 'red'}`} />
                  <div className="log-content">
                    <div className="log-main">{v.visitor_name} → {v.flat_id}</div>
                    <div className="log-meta">{v.purpose} · {fmt(v.created_at)}</div>
                  </div>
                  <span className={`pill ${v.status === 'allowed' ? 'pill-green' : 'pill-red'}`}>{v.status === 'allowed' ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'ann' && (
          <div>
            <div className="card">
              <div className="card-title"><Icon name="broadcast" size={16} /> New Announcement</div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={annType} onChange={e => setAnnType(e.target.value)}>
                  <option value="info">ℹ️ Info</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="emergency">🚨 Emergency</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-textarea" placeholder="Type announcement for all residents..." value={annText} onChange={e => setAnnText(e.target.value)} />
              </div>
              <button className="btn btn-amber btn-full" disabled={saving || !annText.trim()} onClick={sendAnnouncement}>
                <Icon name="broadcast" size={15} /> Broadcast to All Residents
              </button>
            </div>
            <div className="card">
              <div className="card-title"><Icon name="bell" size={16} /> Recent Announcements</div>
              {announcements.length === 0 && <div className="empty">No announcements yet</div>}
              {announcements.map(a => (
                <div key={a.id} className="ann-item">
                  <span className={`ann-tag ${a.type}`}>{a.type}</span>
                  <div className="ann-text">{a.text}</div>
                  <div className="ann-meta">{a.created_by_name} · {fmt(a.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div className="card">
            <div className="card-title"><Icon name="bot" size={16} /> SecureAI Assistant</div>
            <div className="ai-messages">
              {aiMessages.map((m, i) => (
                <div key={i} className={`ai-msg ${m.role}`}>
                  {m.role === 'assistant' && <div className="ai-label">SECURE AI</div>}
                  {m.content}
                </div>
              ))}
              {aiLoading && <div className="ai-msg assistant"><div className="ai-label">SECURE AI</div><span className="spin">⚙</span> Thinking...</div>}
              <div ref={aiEndRef} />
            </div>
            <div className="ai-input-row">
              <input className="ai-input" placeholder="Ask about a flat, visitor, or procedure..." value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAiMessage()} />
              <button className="btn btn-amber btn-icon" onClick={sendAiMessage} disabled={aiLoading}><Icon name="send" size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {['Suspicious visitor protocol', 'Fire emergency steps', 'Which flat is Sharma?', 'Visitor stats today'].map(q => (
                <button key={q} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setAiInput(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {tabs.map(t => (
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.badge > 0 && <span className="nav-badge">{t.badge}</span>}
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
