import { Component } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Guard from './pages/Guard'
import Resident from './pages/Resident'
import Admin from './pages/Admin'

const S = {
  wrap:   { minHeight: '100vh', background: '#0a0d12', color: '#e2e8f0', fontFamily: 'system-ui,sans-serif' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16 },
  icon:   { width: 56, height: 56, background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 },
  muted:  { color: '#64748b', fontSize: 13, fontFamily: 'monospace' },
  errBox: { background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 10, padding: '16px 20px', maxWidth: 340, textAlign: 'center' },
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(e) {
    return { error: e }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ ...S.wrap, ...S.center }}>
          <div style={S.icon}>🏢</div>
          <div style={S.errBox}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>App Error</div>
            <div style={{ fontSize: 13, color: '#fca5a5' }}>{this.state.error.message}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Check Vercel → Settings → Environment Variables are set correctly.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: 14, background: '#f59e0b', color: '#000', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div style={{ ...S.wrap, ...S.center }}>
      <div style={S.icon}>🏢</div>
      <div style={S.muted}>MyApartment · Loading...</div>
    </div>
  )

  if (!user || !profile) return <Login />
  if (profile.role === 'guard') return <Guard />
  if (profile.role === 'admin') return <Admin />
  return <Resident />
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  )
}
