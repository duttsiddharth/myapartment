import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

// Converts what user types → internal Supabase email
// Residents: "A-101" → "flat-a-101@myapartment.local"
// Guard:     "GUARD"  → "guard@myapartment.local"
// Admin:     "ADMIN"  → "admin@myapartment.local"
export function toInternalEmail(input) {
  const v = input.trim().toLowerCase()
  if (v === 'guard') return 'guard@myapartment.local'
  if (v === 'admin') return 'admin@myapartment.local'
  const flat = v.replace(/\s/g, '')
  return `${flat}@myapartment.local`
}

export default function Login() {
  const { signIn } = useAuth()
  const [loginId, setLoginId]     = useState('')
  const [pin, setPin]             = useState('')
  const [showPin, setShowPin]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [activeTab, setActiveTab] = useState('resident')

  const handleLogin = async () => {
    const id = loginId.trim()
    if (!id) { setError('Please enter your Flat Number or Staff ID.'); return }
    if (pin.length < 3) { setError('PIN must be at least 3 digits.'); return }
    setLoading(true); setError('')
    const email = toInternalEmail(id)
    const err = await signIn(email, pin)
    if (err) setError('Invalid credentials. Check your flat number / staff ID and PIN.')
    setLoading(false)
  }

  return (
    <div style={S.page}>
      <div style={S.card}>

        <div style={S.logoWrap}>
          <div style={S.logoIcon}>🏢</div>
          <div style={S.logoTitle}>MyApartment</div>
          <div style={S.logoSub}>Smart Intercom &amp; Visitor Management</div>
        </div>

        {/* Resident / Staff tab */}
        <div style={S.tabs}>
          <button style={{ ...S.tabBtn, ...(activeTab === 'resident' ? S.tabActive : {}) }}
            onClick={() => { setActiveTab('resident'); setLoginId(''); setError('') }}>
            🏠 Resident
          </button>
          <button style={{ ...S.tabBtn, ...(activeTab === 'staff' ? S.tabActive : {}) }}
            onClick={() => { setActiveTab('staff'); setLoginId(''); setError('') }}>
            🛡️ Guard / Admin
          </button>
        </div>

        {error && <div style={S.errorBox}>⚠ {error}</div>}

        <div style={S.fieldWrap}>
          <label style={S.label}>{activeTab === 'resident' ? 'Flat Number' : 'Staff ID'}</label>
          <input
            style={S.input}
            type="text"
            placeholder={activeTab === 'resident' ? 'e.g.  A-101  or  B-203' : 'GUARD  or  ADMIN'}
            value={loginId}
            onChange={e => setLoginId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div style={S.fieldWrap}>
          <label style={S.label}>PIN</label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...S.input, paddingRight: 48, letterSpacing: showPin ? 2 : 8, fontSize: showPin ? 15 : 22 }}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
            />
            <button type="button" onClick={() => setShowPin(p => !p)} style={S.eyeBtn}>
              {showPin ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <button style={{ ...S.loginBtn, ...(loading ? S.disabledBtn : {}) }} onClick={handleLogin} disabled={loading}>
          {loading ? '⚙ Signing in...' : '🔓 Sign In'}
        </button>

        {/* Hint */}
        <div style={S.hintBox}>
          {activeTab === 'resident' ? <>
            <div style={S.hintTitle}>Resident Login</div>
            <div style={S.hintRow}><span style={S.hintKey}>Flat No</span> Your flat number — A-101, B-203, C-405…</div>
            <div style={S.hintRow}><span style={S.hintKey}>PIN</span> 4–8 digit PIN (set by Admin)</div>
          </> : <>
            <div style={S.hintTitle}>Staff Login</div>
            <div style={S.hintRow}><span style={S.hintKey}>GUARD</span> Security guard at gate</div>
            <div style={S.hintRow}><span style={S.hintKey}>ADMIN</span> RWA / Society admin</div>
          </>}
        </div>

        <div style={S.secNote}>🔒 Secured · Encrypted · No ads · No data sharing</div>
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#0a0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', fontFamily: "'Barlow', system-ui, sans-serif" },
  card: { width: '100%', maxWidth: 380, background: '#10141c', border: '1px solid #1e2c42', borderRadius: 20, padding: '28px 22px' },
  logoWrap: { textAlign: 'center', marginBottom: 24 },
  logoIcon: { width: 64, height: 64, background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 12px', boxShadow: '0 0 40px rgba(245,158,11,0.3)' },
  logoTitle: { fontSize: 22, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.5 },
  logoSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  tabs: { display: 'flex', gap: 4, background: '#161c27', border: '1px solid #1e2c42', borderRadius: 10, padding: 3, marginBottom: 20 },
  tabBtn: { flex: 1, padding: '8px 6px', border: 'none', borderRadius: 7, background: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  tabActive: { background: '#f59e0b', color: '#000', boxShadow: '0 2px 8px rgba(245,158,11,0.2)' },
  errorBox: { background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 14 },
  fieldWrap: { marginBottom: 14 },
  label: { display: 'block', fontSize: 11, color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { width: '100%', padding: '12px 14px', background: '#1e2636', border: '1px solid #1e2c42', borderRadius: 9, color: '#e2e8f0', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  eyeBtn: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4 },
  loginBtn: { width: '100%', padding: 14, background: '#f59e0b', color: '#000', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 4, letterSpacing: 0.5, boxShadow: '0 4px 20px rgba(245,158,11,0.2)' },
  disabledBtn: { opacity: 0.6, cursor: 'not-allowed' },
  hintBox: { marginTop: 20, padding: '12px 14px', background: '#161c27', borderRadius: 10, border: '1px solid #1e2c42' },
  hintTitle: { fontSize: 11, color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  hintRow: { fontSize: 13, color: '#94a3b8', marginBottom: 5, display: 'flex', gap: 8, alignItems: 'flex-start' },
  hintKey: { background: '#1e2636', color: '#f59e0b', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 },
  secNote: { textAlign: 'center', marginTop: 16, fontSize: 11, color: '#475569' },
}
