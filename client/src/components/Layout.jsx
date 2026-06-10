import { Link } from 'react-router-dom'

export default function Layout({ user, logout, activeTab, children }) {
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-bb-border bg-white shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🍺</span>
          <span className="font-bold text-bb-green text-lg tracking-tight">BeerBozo CRM</span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1">
          <Link
            to="/crm"
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'crm'
                ? 'bg-bb-light text-bb-green'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            CRM
          </Link>
          <Link
            to="/internal"
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'internal'
                ? 'bg-bb-light text-bb-green'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Internal
          </Link>
        </nav>

        {/* User + logout */}
        <div className="flex items-center gap-3">
          {user?.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-8 h-8 rounded-full border border-bb-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-bb-light border border-bb-border flex items-center justify-center text-xs font-medium text-bb-green">
              {user?.name?.[0] || '?'}
            </div>
          )}
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
