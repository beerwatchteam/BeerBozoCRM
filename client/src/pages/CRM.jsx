import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import StatsCards from '../components/StatsCards'
import EmailList from '../components/EmailList'
import EmailDetail from '../components/EmailDetail'

const SYNC_INTERVAL_MS = 60 * 1000 // 60 seconds

export default function CRM() {
  const { gmailConnected, connectGmail } = useAuth()
  const [emails, setEmails] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [filter, setFilter] = useState('all')
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [recategorizing, setRecategorizing] = useState(false)

  const loadEmails = useCallback(async () => {
    try {
      const data = await api.get('/api/emails')
      setEmails(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Load emails error:', err)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get('/api/emails/stats')
      setStats(data)
    } catch (err) {
      console.error('Load stats error:', err)
    }
  }, [])

  const syncEmails = useCallback(async (silent = false) => {
    if (!gmailConnected) return
    if (!silent) setSyncing(true)
    setSyncError('')
    try {
      await api.post('/api/emails/sync')
      await Promise.all([loadEmails(), loadStats()])
      setLastSyncedAt(new Date())
    } catch (err) {
      console.error('Sync error:', err)
      if (!silent) setSyncError(err.message || 'Sync failed')
    } finally {
      if (!silent) setSyncing(false)
    }
  }, [gmailConnected, loadEmails, loadStats])

  // On mount: load from Firestore first, then sync from Gmail
  useEffect(() => {
    const init = async () => {
      await Promise.all([loadEmails(), loadStats()])
      if (gmailConnected) await syncEmails(true)
    }
    init()
  }, [gmailConnected])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!gmailConnected) return
    const interval = setInterval(() => syncEmails(true), SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [gmailConnected, syncEmails])

  async function handleRecategorize() {
    setRecategorizing(true)
    try {
      const result = await api.post('/api/emails/recategorize')
      if (result.updated > 0) await loadEmails()
    } catch (err) {
      console.error('Recategorize error:', err)
    } finally {
      setRecategorizing(false)
    }
  }

  async function handleConnectGmail() {
    setConnecting(true)
    try {
      await connectGmail()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Gmail connect error:', err)
      }
    } finally {
      setConnecting(false)
    }
  }

  function handleSelectEmail(email) {
    setSelectedEmail(email)
  }

  function handleEmailRead(emailId) {
    setEmails(prev =>
      prev.map(e => (e.id === emailId || e.gmail_id === emailId) ? { ...e, is_read: 1 } : e)
    )
    setStats(prev => prev ? { ...prev, unread: Math.max(0, (prev.unread || 0) - 1) } : prev)
  }

  function handleEmailCategoryChange(emailId, newCategory) {
    setEmails(prev =>
      prev.map(e =>
        (e.id === emailId || e.gmail_id === emailId)
          ? { ...e, category: newCategory, needs_review: false }
          : e
      )
    )
    if (selectedEmail && (selectedEmail.id === emailId || selectedEmail.gmail_id === emailId)) {
      setSelectedEmail(prev => ({ ...prev, category: newCategory, needs_review: false }))
    }
    setStats(prev => prev ? { ...prev, needs_review: Math.max(0, (prev.needs_review || 0) - 1) } : prev)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Gmail not connected banner */}
      {!gmailConnected && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span>Gmail not connected — emails won't load until you authorise access.</span>
          </div>
          <button
            onClick={handleConnectGmail}
            disabled={connecting}
            className="flex items-center gap-2 text-sm font-medium text-white bg-bb-green hover:bg-bb-green-dark px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {connecting && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
            {connecting ? 'Connecting...' : 'Connect Gmail'}
          </button>
        </div>
      )}

      {/* Stats + toolbar */}
      <div className="shrink-0 border-b border-bb-border">
        <div className="flex items-center justify-between">
          <StatsCards stats={stats} />
          <div className="px-6 flex items-center gap-3">
            {syncError && <span className="text-xs text-red-500">{syncError}</span>}
            {syncing && (
              <div className="flex items-center gap-1.5 text-xs text-bb-green">
                <div className="w-3 h-3 border border-bb-green border-t-transparent rounded-full animate-spin" />
                Syncing...
              </div>
            )}
            {!syncing && lastSyncedAt && (
              <span className="text-xs text-gray-400">
                Synced {lastSyncedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => syncEmails(false)}
              disabled={syncing || !gmailConnected}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              Sync Now
            </button>
            <button
              onClick={handleRecategorize}
              disabled={recategorizing}
              className="btn-ghost text-xs"
            >
              {recategorizing ? 'Recategorizing...' : 'Recategorize'}
            </button>
          </div>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-[300px] shrink-0 overflow-hidden border-r border-bb-border">
          <EmailList
            emails={emails}
            selectedId={selectedEmail?.gmail_id || selectedEmail?.id}
            onSelect={handleSelectEmail}
            filter={filter}
            onFilterChange={setFilter}
            syncing={syncing && emails.length === 0}
          />
        </div>

        <div className="flex-1 overflow-hidden">
          {selectedEmail ? (
            <EmailDetail
              key={selectedEmail.gmail_id || selectedEmail.id}
              email={selectedEmail}
              onEmailRead={handleEmailRead}
              onCategoryChange={handleEmailCategoryChange}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <div className="text-5xl">📬</div>
              <p className="text-sm font-medium text-gray-500">Select an email to read it</p>
              <p className="text-xs">{emails.length} email{emails.length !== 1 ? 's' : ''} in inbox</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
