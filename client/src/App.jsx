import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import CRM from './pages/CRM'
import Internal from './pages/Internal'
import Clients from './pages/Clients'
import Tasks from './pages/Tasks'
import ContentCalendar from './pages/ContentCalendar'
import Social from './pages/Social'
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

      {[
        { path: '/crm',      El: CRM            },
        { path: '/clients',  El: Clients        },
        { path: '/tasks',    El: Tasks          },
        { path: '/calendar', El: ContentCalendar },
        { path: '/social',   El: Social         },
        { path: '/internal', El: Internal       },
      ].map(({ path, El }) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Layout user={user} logout={logout}>
                <El />
              </Layout>
            </ProtectedRoute>
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
