import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import Icon from '../components/Icons'

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })

export default function AdminPage() {
  const { profile, signOut } = useAuth()
  const [tab, setTab]               = useState('overview')
  const [stats, setStats]           = useState({ total: 0, allowed: 0, denied: 0, emergencies: 0, announcements: 0 })
  const [visitorLog, setVisitorLog] = useState([])
  const [emergencies, setEmergencies] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [flats, setFlats]           = useState([])
  const [searchQ, setSearchQ]       = useState('')
  const [selectedBlock, setSelectedBlock] = useState('A')
  const [editFlat, setEditFlat]     = useState(null)
  const [editName, setEditName]     = useState('')
  const [annText, setAnnText]       = useState('')
  const [annType, setAnnType]       = useState('info')
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)

  const BLOCKS = ['A', 'B', 'C', 'D']

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [vLog, emerg, anns, flatData] = await Promise.all([
      supabase.from('visitor_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('emergency_alerts').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('flats').select('*').order('block').order('floor').order('unit'),
    ])
    const log = vLog.data || []
    const em  = emerg.data || []
    const an  = anns.data || []
    setVisitorLog(log)
    setEmergencies(em)
    setAnnouncements(an)
    setFlats(flatData.data || [])
    setStats({
      total: log.length,
      allowed: log.filter(v => v.status === 'allowed').length,
      denied: log.filter(v => v.status === 'denied').length,
      emergencies: em.filter(e => !e.acknowledged).length,
      announcements: an.length,
    })
    setLoading(false)
  }

  const updateFlatName = async () => {
    if (!editFlat || !editName.trim()) return
    setSaving(true)
    await supabase.from('flats').update({ resident_name: editName.trim() }).eq('id', editFlat)
    setEditFlat(null); setEditName('')
    setSaving(false)
    loadAll()
  }

  const sendAnnouncement = async () => {
    if (!annText.trim()) return
    setSaving(true)
    await supabase.from('announcements').insert({ text: annText.trim(), type: annType, created_by_name: profile?.name || 'Admin' })
    setAnnText(''); setSaving(false)
    loadAll()
  }

  const deleteAnnouncement = async (id) => {
    await supabase.from('announcements').delete().eq('id', id)
    loadAll()
  }

  const acknowledgeAlert = async (id) => {
    await supabase.from('emergency_alerts').update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('id', id)
    loadAll()
  }

  const filteredFlats = flats.filter(f => {
    if (searchQ) {
      const q = searchQ.toLowerCase()
      return f.id.toLowerCase().includes(q) || f.resident_name.toLowerCase().includes(q)
    }
    return f.block === selectedBlock
  })

  const tabs = [
    { id: 'overview', label: 'OVERVIEW', icon: 'shield' },
    { id: 'flats',    label: 'FLATS',    icon: 'home' },
    { id: 'log',      label: 'LOGS',     icon: 'log' },
    { id: 'ann',      label: 'ANNOUNCE', icon: 'broadcast' },
  ]

  return (
    <div className="app">
      <div className="header">
        <div className="header-logo">
          <div className="logo-icon">⚙️</div>
          <div>
            <div className="logo-text">{import.meta.env.VITE_SOCIETY_NAME || 'MyApartment'}</div>
            <div className="logo-sub">ADMIN · {profile?.name || ''}</div>
          </div>
        </div>
        <div className="header-right">
          {stats.emergencies > 0 && <span className="pill pill-red pulse">🚨 {stats.emergencies}</span>}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={signOut}><Icon name="logout" size={16} /></button>
        </div>
      </div>

      <div className="content" style={{ paddingTop: 12 }}>
        {loading && <div className="empty"><span className="spin">⚙</span> Loading...</div>}

        {!loading && tab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div className="stat-card"><div className="stat-num">200</div><div className="stat-label">Total Flats</div></div>
              <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">Visitors Today</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: 'var(--green)' }}>{stats.allowed}</div><div className="stat-label">Allowed</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: 'var(--red)' }}>{stats.denied}</div><div className="stat-label">Denied</div></div>
            </div>

            {stats.emergencies > 0 && (
              <div className="card" style={{ borderColor: 'var(--red)' }}>
                <div className="card-title" style={{ color: 'var(--red)' }}><Icon name="alert" size={16} /> Active Emergencies</div>
                {emergencies.filter(e => !e.acknowledged).map(e => (
                  <div key={e.id} className="log-item emergency" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div className="log-main">🚨 {e.flat_id} — {e.resident_name}</div>
                      <div className="log-meta">{fmt(e.created_at)}</div>
                    </div>
                    <button className="btn btn-amber btn-sm" onClick={() => acknowledgeAlert(e.id)}>Ack</button>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <div className="card-title"><Icon name="settings" size={16} /> System Info</div>
              {[
                ['Architecture', 'Supabase Realtime + RLS'],
                ['Backend Cost', '₹0 (Free tier)'],
                ['Database', 'PostgreSQL (Supabase)'],
                ['Auth', 'Supabase Auth + Role-based'],
                ['Security', 'Row Level Security on all tables'],
                ['Real-time', 'Supabase Realtime WebSockets'],
                ['Hosting', 'Vercel (Free tier)'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="mono" style={{ color: 'var(--text-dim)' }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title"><Icon name="refresh" size={16} /> Actions</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={loadAll}><Icon name="refresh" size={14} /> Refresh All</button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { if (window.confirm('Delete all visitor logs?')) { await supabase.rpc('delete_all_visitor_logs'); loadAll() } }}>
                  <Icon name="trash" size={14} /> Clear Visitor Logs
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && tab === 'flats' && (
          <div>
            {editFlat && (
              <div className="card" style={{ borderColor: 'var(--amber)' }}>
                <div className="card-title"><Icon name="settings" size={16} /> Edit Flat {editFlat}</div>
                <div className="form-group">
                  <label className="form-label">Resident Name</label>
                  <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Family name" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-amber" style={{ flex: 1 }} disabled={saving} onClick={updateFlatName}><Icon name="check" size={14} /> Save</button>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setEditFlat(null); setEditName('') }}><Icon name="x" size={14} /> Cancel</button>
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-title"><Icon name="home" size={16} /> Flat Directory</div>
              <div className="search-wrap">
                <span className="search-icon"><Icon name="search" size={16} /></span>
                <input className="search-input" placeholder="Search flat or resident..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              </div>
              {!searchQ && (
                <div className="block-tabs">
                  {BLOCKS.map(b => <button key={b} className={`block-tab ${selectedBlock === b ? 'active' : ''}`} onClick={() => setSelectedBlock(b)}>Block {b}</button>)}
                </div>
              )}
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {filteredFlats.map(f => (
                  <div key={f.id} className="flat-item">
                    <div className="flat-badge mono">{f.id}</div>
                    <div className="flat-info">
                      <div className="flat-name">{f.resident_name}</div>
                      <div className="flat-meta">Floor {f.floor} · Unit {f.unit}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditFlat(f.id); setEditName(f.resident_name) }}><Icon name="settings" size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && tab === 'log' && (
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 0 }}><Icon name="log" size={16} /> All Visitor Logs</div>
                <button className="btn btn-ghost btn-sm" onClick={loadAll}><Icon name="refresh" size={14} /></button>
              </div>
              {visitorLog.length === 0 && <div className="empty">No visitor records</div>}
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

        {!loading && tab === 'ann' && (
          <div>
            <div className="card">
              <div className="card-title"><Icon name="broadcast" size={16} /> Post Announcement</div>
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
                <textarea className="form-textarea" placeholder="Type your announcement..." value={annText} onChange={e => setAnnText(e.target.value)} />
              </div>
              <button className="btn btn-amber btn-full" disabled={saving || !annText.trim()} onClick={sendAnnouncement}>
                <Icon name="broadcast" size={15} /> Broadcast to All Residents
              </button>
            </div>
            <div className="card">
              <div className="card-title"><Icon name="bell" size={16} /> All Announcements</div>
              {announcements.length === 0 && <div className="empty">No announcements posted</div>}
              {announcements.map(a => (
                <div key={a.id} className="ann-item" style={{ position: 'relative' }}>
                  <span className={`ann-tag ${a.type}`}>{a.type}</span>
                  <div className="ann-text">{a.text}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <div className="ann-meta">{a.created_by_name} · {fmt(a.created_at)}</div>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px' }} onClick={() => deleteAnnouncement(a.id)}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bottom-nav">
        {tabs.map(t => (
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
