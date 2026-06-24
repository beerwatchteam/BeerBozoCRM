import { Link, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import {
  InboxIcon, ClientsIcon, TasksIcon, CalendarIcon, InternalIcon, SettingsIcon, SocialIcon,
} from './Icons'

const NAV_ITEMS = [
  { to: '/crm',      label: 'Inbox',     Icon: InboxIcon    },
  { to: '/clients',  label: 'Clients',   Icon: ClientsIcon  },
  { to: '/tasks',    label: 'Tasks',     Icon: TasksIcon    },
  { to: '/calendar', label: 'Calendar',  Icon: CalendarIcon },
  { to: '/social',   label: 'Social',    Icon: SocialIcon   },
  { to: '/internal', label: 'Internal',  Icon: InternalIcon },
]

const PAGE_TITLES = {
  '/crm':      'Inbox',
  '/clients':  'Clients',
  '/tasks':    'Tasks',
  '/calendar': 'Content Calendar',
  '/social':   'Social Media',
  '/internal': 'Internal Team',
  '/settings': 'Settings',
}

export default function Layout({ user, logout, children }) {
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] || 'BeerBozo CRM'
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayName = user?.displayName || user?.name || user?.email || 'User'
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden bg-bb-light">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 bg-sidebar flex flex-col h-full">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-bb-green rounded-lg flex items-center justify-center text-white text-base font-bold shadow-sm">
              B
            </div>
            <div>
              <div className="text-white text-sm font-bold leading-tight tracking-tight">BeerBozo</div>
              <div className="text-sidebar-text text-[11px] leading-tight">CRM</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, Icon }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-sidebar-active text-white shadow-sm'
                    : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: settings + user */}
        <div className="px-3 pb-4 space-y-0.5">
          <Link
            to="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/settings'
                ? 'bg-sidebar-active text-white'
                : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
            }`}
          >
            <SettingsIcon className="w-[18px] h-[18px] shrink-0" />
            Settings
          </Link>

          {/* User row */}
          <div
            ref={menuRef}
            className="relative mt-2 pt-3 border-t border-white/5"
          >
            <button
              onClick={() => setUserMenuOpen(p => !p)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-sidebar-hover transition-colors"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  className="w-8 h-8 rounded-full border border-white/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-bb-green flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {initials}
                </div>
              )}
              <div className="flex-1 text-left min-w-0">
                <p className="text-white text-xs font-medium truncate">{displayName}</p>
                <p className="text-sidebar-text text-[11px] truncate">{user?.email}</p>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-card-lg border border-bb-border py-1 z-50">
                <button
                  onClick={() => { setUserMenuOpen(false); logout() }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-bb-light transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 px-6 bg-white border-b border-bb-border flex items-center justify-between shrink-0 shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
          {/* Avatar (redundant with sidebar but requested) */}
          <div className="flex items-center gap-2">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="w-8 h-8 rounded-full border border-bb-border"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bb-green flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
            )}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
