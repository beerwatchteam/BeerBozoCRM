import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import CRM from './pages/CRM'
import Internal from './pages/Internal'
import Clients from './pages/Clients'
import Tasks from './pages/Tasks'
import ContentCalendar from './pages/ContentCalendar'
import Layout from './components/Layout'

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
  const { user, loading, logout } = useAuth()

  return (
    <Routes>
      <Route path="/" element={!loading && user ? <Navigate to="/crm" replace /> : <Login />} />

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
        path="/clients"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <Layout user={user} logout={logout} activeTab="clients">
              <Clients />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tasks"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <Layout user={user} logout={logout} activeTab="tasks">
              <Tasks />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/calendar"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <Layout user={user} logout={logout} activeTab="calendar">
              <ContentCalendar />
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
