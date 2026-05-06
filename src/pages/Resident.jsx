import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useIncomingCall, useEmergencyAlerts, useAnnouncements } from '../hooks/useRealtime'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useVoiceCall } from '../hooks/useVoiceCall'
import Icon from '../components/Icons'

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
const fmtTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const FLOORS = [1,2,3,4,5,6,7,8,9,10,11,12,13]

// Global reference to stop any playing ringtone
let globalStopRing = null

function createRingtone() {
  // Stop any existing ringtone first
  if (globalStopRing) { globalStopRing(); globalStopRing = null }

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    let stopped = false
    let vibrateInterval = null

    const playBeep = () => {
      if (stopped) return
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()
      osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination)
      osc1.frequency.value = 400; osc2.frequency.value = 450
      osc1.type = 'sine'; osc2.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
      osc1.start(ctx.currentTime); osc2.start(ctx.currentTime)
      osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8)
      setTimeout(() => { if (!stopped) playBeep() }, 1800)
    }

    playBeep()

    if (navigator.vibrate) {
      vibrateInterval = setInterval(() => {
        if (!stopped) navigator.vibrate([500, 500, 500, 500, 500])
      }, 2500)
    }

    const stop = () => {
      stopped = true
      if (vibrateInterval) clearInterval(vibrateInterval)
      try { navigator.vibrate(0) } catch {}
      try { ctx.close() } catch {}
      globalStopRing = null
    }

    globalStopRing = stop
    return stop
  } catch (e) {
    return () => {}
  }
}

// Stop ringtone when page is closed/hidden
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { if (globalStopRing) globalStopRing() })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && globalStopRing) globalStopRing()
  })
}

export default function ResidentPage() {
  const { profile, signOut } = useAuth()
  const flat = profile?.flats
  const push = usePushNotifications(profile?.id, flat?.id, 'resident')
  const voice = useVoiceCall()

  const [tab, setTab]                   = useState('home')
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeCall, setActiveCall]     = useState(null)
  const [callTimer, setCallTimer]       = useState(0)
  const [myLog, setMyLog]               = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [newAnnCount, setNewAnnCount]   = useState(0)

  // Intercom state
  const [allFlats, setAllFlats]         = useState([])
  const [intercomSearch, setIntercomSearch] = useState('')
  const [intercomFloor, setIntercomFloor]   = useState(1)
  const [outgoingCall, setOutgoingCall] = useState(null)  // call resident placed
  const [callTarget, setCallTarget]     = useState(null)  // who they called

  const timerRef    = useRef(null)
  const stopRingRef = useRef(null)

  useEffect(() => {
    if (flat?.id) { loadMyLog(); loadAnnouncements(); loadAllFlats() }
    // Cleanup ringtone on unmount
    return () => { if (globalStopRing) globalStopRing() }
  }, [flat?.id])

  const loadMyLog = async () => {
    const { data } = await supabase.from('visitor_log').select('*').eq('flat_id', flat.id).order('created_at', { ascending: false }).limit(30)
    setMyLog(data || [])
  }
  const loadAnnouncements = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
    setAnnouncements(data || [])
  }
  const loadAllFlats = async () => {
    const { data } = await supabase.from('flats').select('*').order('floor').order('unit')
    setAllFlats(data || [])
  }

  // Realtime: incoming call
  useIncomingCall(flat?.id, (call) => {
    setIncomingCall(call)
    if (stopRingRef.current) stopRingRef.current()
    stopRingRef.current = createRingtone()
    // Auto stop ring after 30 seconds if not answered
    setTimeout(() => { if (stopRingRef.current) stopRingRef.current() }, 30000)
  })

  // Stop ring when incoming call state clears
  useEffect(() => {
    if (!incomingCall && stopRingRef.current) {
      stopRingRef.current()
      stopRingRef.current = null
    }
  }, [incomingCall])

  useAnnouncements((ann) => {
    setAnnouncements(prev => [ann, ...prev])
    if (tab !== 'ann') setNewAnnCount(c => c + 1)
  })
  useEmergencyAlerts('resident', () => {})

  // Call timer
  useEffect(() => {
    if (activeCall?.status === 'connected' || outgoingCall?.status === 'connected') {
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [activeCall?.status, outgoingCall?.status])

  const stopRing = () => {
    if (stopRingRef.current) { stopRingRef.current(); stopRingRef.current = null }
  }

  // ── Incoming call handlers ────────────────────────────────────────
  const acceptCall = async () => {
    stopRing()
    await supabase.from('calls').update({ status: 'connected' }).eq('id', incomingCall.id)
    setActiveCall({ ...incomingCall, status: 'connected' })
    setIncomingCall(null)
    setCallTimer(0)
    if (incomingCall.channel_name) voice.answerCall(incomingCall.channel_name).catch(console.error)
  }

  const respondToCall = async (status) => {
    stopRing()
    const callId = incomingCall?.id || activeCall?.id
    if (callId) await supabase.from('calls').update({ status }).eq('id', callId)
    await supabase.from('visitor_log').insert({
      visitor_name: (incomingCall || activeCall)?.visitor_name || 'Visitor',
      purpose: (incomingCall || activeCall)?.visitor_purpose || 'Visit',
      flat_id: flat.id, resident_name: flat.resident_name, status,
    })
    await voice.endCall()
    setIncomingCall(null); setActiveCall(null)
    clearInterval(timerRef.current); setCallTimer(0)
    loadMyLog()
  }

  // ── Outgoing call handlers (resident → guard/admin/resident) ──────
  const placeCall = async (target) => {
    if (outgoingCall) return
    const channelName = `intercom-${flat.id}-${target.id}-${Date.now()}`
    setCallTarget(target)

    const { data, error } = await supabase.from('calls').insert({
      flat_id: target.id,           // who we're calling
      resident_name: target.name,
      visitor_name: flat.resident_name,
      visitor_purpose: `Intercom from Flat ${flat.id}`,
      status: 'ringing',
      initiated_by: profile.id,
      channel_name: channelName,
    }).select().single()

    if (!error) {
      setOutgoingCall({ ...data, status: 'ringing' })
      voice.joinCall(channelName).catch(console.error)
      setCallTimer(0)
    }
  }

  const endOutgoingCall = async () => {
    if (!outgoingCall) return
    await supabase.from('calls').update({ status: 'ended' }).eq('id', outgoingCall.id)
    await voice.endCall()
    setOutgoingCall(null); setCallTarget(null)
    clearInterval(timerRef.current); setCallTimer(0)
  }

  const sendSOS = async () => {
    if (!window.confirm('Send Emergency SOS to security guard?')) return
    await supabase.from('emergency_alerts').insert({
      flat_id: flat.id, resident_name: flat.resident_name,
      message: 'SOS — Immediate assistance required',
    })
    alert('🚨 Emergency alert sent to security. Help is on the way.')
  }

  // Intercom directory
  const intercomFlats = allFlats.filter(f => {
    if (f.id === flat?.id) return false  // don't show self
    if (intercomSearch) {
      const q = intercomSearch.toLowerCase()
      return f.id.toLowerCase().includes(q) || f.resident_name.toLowerCase().includes(q)
    }
    return f.floor === intercomFloor
  })

  const tabs = [
    { id: 'home',     label: 'HOME',     icon: 'home' },
    { id: 'intercom', label: 'CALL',     icon: 'phone' },
    { id: 'log',      label: 'LOG',      icon: 'log' },
    { id: 'ann',      label: 'ALERTS',   icon: 'bell', badge: newAnnCount },
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
            <div className="logo-text" style={{ fontSize: 16 }}>Flat {flat.id} — {flat.resident_name}</div>
            <div className="logo-sub">RESIDENT · Floor {flat.floor} · Unit {flat.unit}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={signOut}><Icon name="logout" size={16} /></button>
      </div>

      {/* Active incoming call bar */}
      {activeCall?.status === 'connected' && (
        <div style={{ padding: '12px 16px 0' }}>
          <div className="active-call-bar">
            <Icon name="mic" size={18} style={{ color: 'var(--green)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>🎙 Gate Security · {fmtTimer(callTimer)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live voice call</div>
            </div>
            {voice.callState === 'connected' && (
              <button className={`btn btn-sm ${voice.isMuted ? 'btn-amber' : 'btn-ghost'}`} onClick={voice.toggleMute} style={{ marginRight: 6 }}>
                {voice.isMuted ? '🔇' : '🎙'}
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-green btn-sm" onClick={() => respondToCall('allowed')}><Icon name="unlock" size={13} /> Allow</button>
              <button className="btn btn-red btn-sm" onClick={() => respondToCall('denied')}><Icon name="lock" size={13} /> Deny</button>
            </div>
          </div>
        </div>
      )}

      {/* Active outgoing call bar */}
      {outgoingCall && (
        <div style={{ padding: '12px 16px 0' }}>
          <div className="active-call-bar" style={{ background: 'linear-gradient(90deg,var(--blue-dim),#1e3a5f)', borderColor: 'var(--blue)' }}>
            <Icon name={voice.callState === 'connected' ? 'mic' : 'phone'} size={18} style={{ color: 'var(--blue)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{callTarget?.name || 'Calling...'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {voice.callState === 'connected' ? `🎙 Connected · ${fmtTimer(callTimer)}` : '🔔 Ringing...'}
              </div>
            </div>
            {voice.callState === 'connected' && (
              <button className={`btn btn-sm ${voice.isMuted ? 'btn-amber' : 'btn-ghost'}`} onClick={voice.toggleMute} style={{ marginRight: 6 }}>
                {voice.isMuted ? '🔇' : '🎙'}
              </button>
            )}
            <button className="btn btn-red btn-sm" onClick={endOutgoingCall}><Icon name="phoneOff" size={14} /></button>
          </div>
        </div>
      )}

      <div className="content" style={{ paddingTop: 12 }}>

        {/* ── HOME TAB ── */}
        {tab === 'home' && (
          <div>
            <div className="card" style={{ background: 'linear-gradient(135deg,#1e2636,#10141c)', borderColor: 'var(--amber)' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ background: 'var(--amber)', borderRadius: 12, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 18, color: '#000' }}>{flat.id}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{flat.resident_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Floor {flat.floor} · Unit {flat.unit}</div>
                  <span className="pill pill-green" style={{ marginTop: 4 }}>● Active</span>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <button className="btn btn-ghost" style={{ padding: '14px', flexDirection: 'column', gap: 6, height: 80, borderRadius: 12 }}
                onClick={() => { setTab('intercom'); setCallTarget({ id: 'guard', name: 'Gate Security', role: 'guard' }) }}>
                <Icon name="shield" size={22} style={{ color: 'var(--amber)' }} />
                <span style={{ fontSize: 13 }}>Call Guard</span>
              </button>
              <button className="btn btn-ghost" style={{ padding: '14px', flexDirection: 'column', gap: 6, height: 80, borderRadius: 12 }}
                onClick={() => setTab('intercom')}>
                <Icon name="phone" size={22} style={{ color: 'var(--blue)' }} />
                <span style={{ fontSize: 13 }}>Intercom</span>
              </button>
            </div>

            {/* Push notifications */}
            <div className="card" style={{ borderColor: push.subscribed ? 'var(--green)' : 'var(--border)' }}>
              <div className="card-title"><Icon name="bell" size={16} /> Call Notifications</div>
              {!push.isSupported ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>⚠ Use Chrome (Android) or Safari 16.4+ (iPhone) for push notifications.</div>
              ) : push.subscribed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="pill pill-green">● Notifications ON</span>
                  <button className="btn btn-ghost btn-sm" onClick={push.unsubscribe} disabled={push.loading}>Turn Off</button>
                </div>
              ) : (
                push.permission === 'denied'
                  ? <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-dim)', padding: '10px 12px', borderRadius: 8 }}>⚠ Notifications blocked in browser settings.</div>
                  : <button className="btn btn-amber btn-full" onClick={push.subscribe} disabled={push.loading}>
                      <Icon name="bell" size={15} /> {push.loading ? 'Setting up...' : '🔔 Enable Gate Call Notifications'}
                    </button>
              )}
            </div>

            {/* SOS */}
            <div className="card">
              <div className="card-title" style={{ color: 'var(--red)' }}><Icon name="alert" size={16} /> Emergency SOS</div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>Use only in a genuine emergency. Immediately alerts the security guard.</p>
              <button className="sos-btn" onClick={sendSOS}><Icon name="alert" size={22} /> EMERGENCY SOS</button>
            </div>

            {/* Recent visitors */}
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

        {/* ── INTERCOM TAB ── */}
        {tab === 'intercom' && (
          <div>
            {/* Call Guard / Admin directly */}
            <div className="card">
              <div className="card-title"><Icon name="shield" size={16} /> Staff</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="flat-item" style={{ flex: 1, cursor: 'default' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
                  <div className="flat-info">
                    <div className="flat-name">Gate Security</div>
                    <div className="flat-meta">Guard</div>
                  </div>
                  <button className="btn btn-amber btn-sm btn-icon"
                    disabled={!!outgoingCall}
                    onClick={() => placeCall({ id: 'guard', name: 'Gate Security', role: 'guard' })}>
                    <Icon name="phone" size={15} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <div className="flat-item" style={{ flex: 1, cursor: 'default' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue-dim)', border: '1px solid var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚙️</div>
                  <div className="flat-info">
                    <div className="flat-name">RWA Admin</div>
                    <div className="flat-meta">Administration</div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon"
                    disabled={!!outgoingCall}
                    onClick={() => placeCall({ id: 'admin', name: 'RWA Admin', role: 'admin' })}>
                    <Icon name="phone" size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Call other residents */}
            <div className="card">
              <div className="card-title"><Icon name="home" size={16} /> Residents</div>
              <div className="search-wrap">
                <span className="search-icon"><Icon name="search" size={16} /></span>
                <input className="search-input" placeholder="Search flat no. or resident..." value={intercomSearch} onChange={e => setIntercomSearch(e.target.value)} />
              </div>

              {/* Floor tabs */}
              {!intercomSearch && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
                  {FLOORS.map(f => (
                    <button key={f} onClick={() => setIntercomFloor(f)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, border: '1px solid',
                        borderColor: intercomFloor === f ? 'var(--amber)' : 'var(--border)',
                        background: intercomFloor === f ? 'var(--amber)' : 'var(--surface3)',
                        color: intercomFloor === f ? '#000' : 'var(--text-muted)',
                        fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                        fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                      Fl. {f}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {intercomFlats.map(f => (
                  <div key={f.id} className="flat-item">
                    <div className="flat-badge mono">
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fl.{f.floor}</div>
                      <div>{f.id}</div>
                    </div>
                    <div className="flat-info">
                      <div className="flat-name">{f.resident_name}</div>
                      <div className="flat-meta">Floor {f.floor} · Unit {f.unit}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      disabled={!!outgoingCall}
                      title="Intercom call"
                      onClick={() => placeCall({ id: f.id, name: f.resident_name, role: 'resident' })}>
                      <Icon name="mic" size={15} />
                    </button>
                  </div>
                ))}
                {intercomFlats.length === 0 && <div className="empty">No residents found</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── LOG TAB ── */}
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

        {/* ── ALERTS TAB ── */}
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
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); if (t.id === 'ann') setNewAnnCount(0) }}>
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
            <div className="call-avatar ringing">
              {incomingCall.visitor_purpose?.includes('Intercom') ? <Icon name="home" size={32} /> : <Icon name="shield" size={32} />}
            </div>
            <div className="call-flat">
              {incomingCall.visitor_purpose?.includes('Intercom') ? `Flat ${incomingCall.visitor_name}` : 'Security Gate'}
            </div>
            <div className="call-resident">
              {incomingCall.visitor_purpose?.includes('Intercom') ? 'Intercom Call' : 'Visitor at Gate'}
            </div>
            <div className="call-visitor">
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>FROM</div>
              <div style={{ fontWeight: 600 }}>{incomingCall.visitor_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{incomingCall.visitor_purpose}</div>
            </div>
            <div className="call-actions">
              <button className="call-btn reject" onClick={() => respondToCall('denied')}><Icon name="phoneOff" size={24} /></button>
              <button className="call-btn accept" onClick={acceptCall}><Icon name="phone" size={24} /></button>
            </div>
            {!incomingCall.visitor_purpose?.includes('Intercom') && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
                <button className="btn btn-green btn-sm" onClick={() => respondToCall('allowed')}><Icon name="unlock" size={13} /> Allow Without Call</button>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              📞 Accept to speak · ❌ Reject to deny
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
