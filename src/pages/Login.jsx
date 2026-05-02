import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import Icon from '../components/Icons'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) return setError('Please enter email and password.')
    setLoading(true); setError('')
    const err = await signIn(email.trim().toLowerCase(), password)
    if (err) setError(err.message === 'Invalid login credentials' ? 'Invalid email or password.' : err.message)
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🏢</div>
          <div className="login-title">{import.meta.env.VITE_SOCIETY_NAME || 'MyApartment'}</div>
          <div className="login-sub">Intercom &amp; Visitor Management System</div>
        </div>

        {error && <div className="login-error">⚠ {error}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingRight: 44 }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          <button className="btn btn-amber btn-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <span className="spin">⚙</span> : <Icon name="unlock" size={16} />}
            {loading ? ' Signing in...' : ' Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: '14px', background: 'var(--surface3)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Access Levels</div>
          {[
            ['🛡️', 'Security Guard', 'Visitor management, calls, logs'],
            ['🏠', 'Resident', 'Receive calls, SOS, announcements'],
            ['⚙️', 'Admin / RWA', 'Full access, user management'],
          ].map(([icon, role, desc]) => (
            <div key={role} style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
              <span>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{role}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          🔒 Secured by Supabase Auth + RLS
        </div>
      </div>
    </div>
  )
}
