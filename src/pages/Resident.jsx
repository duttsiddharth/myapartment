import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useIncomingCall, useEmergencyAlerts, useAnnouncements } from '../hooks/useRealtime'
import Icon from '../components/Icons'

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
const fmtTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function ResidentPage() {
  const { profile, signOut } = useAuth()
  const flat = profile?.flats
  const [tab, setTab]                   = useState('home')
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeCall, setActiveCall]     = useState(null)
  const [callTimer, setCallTimer]       = useState(0)
  const [myLog, setMyLog]               = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [newAnnCount, setNewAnnCount]   = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (flat?.id) { loadMyLog(); loadAnnouncements() }
  }, [flat?.id])

  const loadMyLog = async () => {
    const { data } = await supabase.from('visitor_log').select('*').eq('flat_id', flat.id).order('created_at', { ascending: false }).limit(30)
    setMyLog(data || [])
  }
  const loadAnnouncements = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
    setAnnouncements(data || [])
  }

  // Realtime: incoming call for my flat
  useIncomingCall(flat?.id, (call) => {
    setIncomingCall(call)
    // Play browser notification sound
    try { new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA...').play().catch(() => {}) } catch {}
  })

  // Realtime: announcements
  useAnnouncements((ann) => {
    setAnnouncements(prev => [ann, ...prev])
    if (tab !== 'ann') setNewAnnCount(c => c + 1)
  })

  // Realtime: emergency ack (don't need for resident — they just send)
  useEmergencyAlerts('resident', () => {})

  // Call timer
  useEffect(() => {
    if (activeCall?.status === 'connected') {
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [activeCall?.status])

  const acceptCall = async () => {
    await supabase.from('calls').update({ status: 'connected' }).eq('id', incomingCall.id)
    setActiveCall({ ...incomingCall, status: 'connected' })
    setIncomingCall(null)
    setCallTimer(0)
  }

  const respondToCall = async (status) => {
    // status: 'allowed' | 'denied'
    const callId = incomingCall?.id || activeCall?.id
    if (callId) await supabase.from('calls').update({ status }).eq('id', callId)
    // Log it
    await supabase.from('visitor_log').insert({
      visitor_name: (incomingCall || activeCall)?.visitor_name || 'Visitor',
      purpose: (incomingCall || activeCall)?.visitor_purpose || 'Visit',
      flat_id: flat.id,
      resident_name: flat.resident_name,
      status,
    })
    setIncomingCall(null)
    setActiveCall(null)
    clearInterval(timerRef.current)
    setCallTimer(0)
    loadMyLog()
  }

  const sendSOS = async () => {
    if (!window.confirm('Send Emergency SOS to security guard?')) return
    await supabase.from('emergency_alerts').insert({
      flat_id: flat.id,
      resident_name: flat.resident_name,
      message: 'SOS — Immediate assistance required',
    })
    alert('🚨 Emergency alert sent to security. Help is on the way.')
  }

  const tabs = [
    { id: 'home', label: 'HOME',    icon: 'home' },
    { id: 'log',  label: 'LOG',     icon: 'log' },
    { id: 'ann',  label: 'ALERTS',  icon: 'bell', badge: newAnnCount },
  ]

  if (!flat) return (
    <div className="app">
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', marginTop: 80 }}>
        <Icon name="home" size={40} style={{ color: 'var(--amber)', marginBottom: 16, display: 'block', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, marginBottom: 8 }}>No flat assigned</div>
        <div style={{ fontSize: 13 }}>Contact admin to link your account to a flat.</div>
        <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={signOut}><Icon name="logout" size={15} /> Sign Out</button>
      </div>
    </div>
  )

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-logo">
          <div className="logo-icon">🏠</div>
          <div>
            <div className="logo-text" style={{ fontSize: 16 }}>{flat.id} — {flat.resident_name}</div>
            <div className="logo-sub">RESIDENT · Block {flat.block} · Floor {flat.floor}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={signOut}><Icon name="logout" size={16} /></button>
      </div>

      {/* Active Call Bar */}
      {activeCall?.status === 'connected' && (
        <div style={{ padding: '12px 16px 0' }}>
          <div className="active-call-bar">
            <Icon name="mic" size={18} style={{ color: 'var(--green)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Talking to Security Gate</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtTimer(callTimer)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-green btn-sm" onClick={() => respondToCall('allowed')}><Icon name="unlock" size={13} /> Allow</button>
              <button className="btn btn-red btn-sm" onClick={() => respondToCall('denied')}><Icon name="lock" size={13} /> Deny</button>
            </div>
          </div>
        </div>
      )}

      <div className="content" style={{ paddingTop: 12 }}>
        {tab === 'home' && (
          <div>
            <div className="card" style={{ background: 'linear-gradient(135deg, #1e2636, #10141c)', borderColor: 'var(--amber)', borderWidth: 1 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ background: 'var(--amber)', borderRadius: 12, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 16, color: '#000' }}>{flat.id}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{flat.resident_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Block {flat.block} · Floor {flat.floor} · Unit {flat.unit}</div>
                  <span className="pill pill-green" style={{ marginTop: 4 }}>● Active</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title"><Icon name="phone" size={16} /> How It Works</div>
              {[
                ['1', 'Guard registers visitor at gate'],
                ['2', 'Your phone gets a call notification'],
                ['3', 'Accept to speak — then Allow or Deny'],
                ['4', 'Entry logged automatically in visitor record'],
              ].map(([n, t]) => (
                <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ background: 'var(--amber)', color: '#000', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{n}</div>
                  <div style={{ fontSize: 14, paddingTop: 4 }}>{t}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title" style={{ color: 'var(--red)' }}><Icon name="alert" size={16} /> Emergency SOS</div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>Use only in a genuine emergency. Immediately alerts the security guard with your flat details.</p>
              <button className="sos-btn" onClick={sendSOS}><Icon name="alert" size={22} /> EMERGENCY SOS</button>
            </div>

            <div className="card">
              <div className="card-title"><Icon name="log" size={16} /> Recent Visitors</div>
              {myLog.slice(0, 5).length === 0 && <div className="empty">No visitor history</div>}
              {myLog.slice(0, 5).map(v => (
                <div key={v.id} className={`log-item ${v.status}`}>
                  <div className={`log-dot ${v.status === 'allowed' ? 'green' : 'red'}`} />
                  <div className="log-content">
                    <div className="log-main">{v.visitor_name}</div>
                    <div className="log-meta">{v.purpose} · {fmt(v.created_at)}</div>
                  </div>
                  <span className={`pill ${v.status === 'allowed' ? 'pill-green' : 'pill-red'}`}>{v.status === 'allowed' ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}><Icon name="log" size={16} /> My Visitor Log</div>
              <button className="btn btn-ghost btn-sm" onClick={loadMyLog}><Icon name="refresh" size={14} /></button>
            </div>
            {myLog.length === 0 && <div className="empty">No visitors logged yet</div>}
            {myLog.map(v => (
              <div key={v.id} className={`log-item ${v.status}`}>
                <div className={`log-dot ${v.status === 'allowed' ? 'green' : 'red'}`} />
                <div className="log-content">
                  <div className="log-main">{v.visitor_name}</div>
                  <div className="log-meta">{v.purpose} · {fmt(v.created_at)}</div>
                </div>
                <span className={`pill ${v.status === 'allowed' ? 'pill-green' : 'pill-red'}`}>{v.status === 'allowed' ? 'Allowed' : 'Denied'}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'ann' && (
          <div className="card">
            <div className="card-title"><Icon name="bell" size={16} /> Society Announcements</div>
            {announcements.length === 0 && <div className="empty">No announcements</div>}
            {announcements.map(a => (
              <div key={a.id} className="ann-item">
                <span className={`ann-tag ${a.type}`}>{a.type}</span>
                <div className="ann-text">{a.text}</div>
                <div className="ann-meta">{a.created_by_name} · {fmt(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {tabs.map(t => (
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); if (t.id === 'ann') setNewAnnCount(0) }}>
            {t.badge > 0 && <span className="nav-badge">{t.badge}</span>}
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="call-avatar ringing"><Icon name="shield" size={32} /></div>
            <div className="call-flat">Security Gate</div>
            <div className="call-resident">Visitor for your flat</div>
            <div className="call-visitor">
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>VISITOR DETAILS</div>
              <div style={{ fontWeight: 600 }}>{incomingCall.visitor_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{incomingCall.visitor_purpose}</div>
            </div>
            <div className="call-actions">
              <button className="call-btn reject" onClick={() => respondToCall('denied')}><Icon name="lock" size={24} /></button>
              <button className="call-btn accept" onClick={acceptCall}><Icon name="phone" size={24} /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
              <button className="btn btn-green btn-sm" onClick={() => respondToCall('allowed')}><Icon name="unlock" size={13} /> Allow Without Call</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>Tap ✓ phone to speak · Tap 🔒 to deny</div>
          </div>
        </div>
      )}
    </div>
  )
}
