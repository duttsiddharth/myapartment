import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Guard from './pages/Guard'
import Resident from './pages/Resident'
import Admin from './pages/Admin'

function AppContent() {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: '0 0 30px rgba(245,158,11,0.3)' }}>🏢</div>
      <div style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>Loading...</div>
    </div>
  )

  if (!user || !profile) return <Login />

  if (profile.role === 'guard') return <Guard />
  if (profile.role === 'admin') return <Admin />
  return <Resident />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
