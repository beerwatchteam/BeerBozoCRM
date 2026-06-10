import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import CRM from './pages/CRM'
import Internal from './pages/Internal'
import Layout from './components/Layout'

// Handles the OAuth callback: extracts token from URL and stores it
function AuthCallback({ setUser }) {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('error')

    if (error) {
      navigate(`/?error=${error}`)
      return
    }

    if (token) {
      localStorage.setItem('auth_token', token)
      // Decode basic user info from JWT payload (no sensitive data)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUser({ email: payload.email, name: payload.name, picture: payload.picture })
      } catch {}
      navigate('/crm', { replace: true })
    } else {
      navigate('/')
    }
  }, [])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-bb-green font-medium">Signing you in...</div>
    </div>
  )
}

function ProtectedRoute({ user, loading, children }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user, loading, setUser, logout } = useAuth()

  return (
    <Routes>
      <Route path="/" element={!loading && user ? <Navigate to="/crm" replace /> : <Login />} />

      <Route
        path="/auth/callback"
        element={<AuthCallback setUser={setUser} />}
      />

      <Route
        path="/crm"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <Layout user={user} logout={logout} activeTab="crm">
              <CRM />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/internal"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <Layout user={user} logout={logout} activeTab="internal">
              <Internal />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
