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
    setEmails((prev) =>
      prev.map((e) =>
        (e.id === emailId || e.gmail_id === emailId) ? { ...e, is_read: 1 } : e
      )
    )
    setStats((prev) => prev ? { ...prev, unread: Math.max(0, (prev.unread || 0) - 1) } : prev)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Gmail not connected banner */}
      {!gmailConnected && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span>📭</span>
            <span>Gmail is not connected — your inbox won't load until you authorise access.</span>
          </div>
          <button
            onClick={handleConnectGmail}
            disabled={connecting}
            className="flex items-center gap-2 text-sm font-medium text-white bg-bb-green hover:bg-bb-green/90 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {connecting && (
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            )}
            {connecting ? 'Connecting...' : 'Connect Gmail'}
          </button>
        </div>
      )}

      {/* Stats + toolbar */}
      <div className="shrink-0 bg-white border-b border-bb-border">
        <StatsCards stats={stats} />
        <div className="px-6 pb-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {!gmailConnected
              ? 'Gmail not connected'
              : lastSyncedAt
                ? `Last synced ${lastSyncedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                : 'Syncing...'}
          </span>
          <div className="flex items-center gap-3">
            {syncError && (
              <span className="text-xs text-red-500">{syncError}</span>
            )}
            {syncing && (
              <div className="flex items-center gap-1.5 text-xs text-bb-green">
                <div className="w-3 h-3 border border-bb-green border-t-transparent rounded-full animate-spin" />
                Syncing inbox...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Email list — fixed width */}
        <div className="w-80 shrink-0 overflow-hidden">
          <EmailList
            emails={emails}
            selectedId={selectedEmail?.gmail_id || selectedEmail?.id}
            onSelect={handleSelectEmail}
            filter={filter}
            onFilterChange={setFilter}
            syncing={syncing && emails.length === 0}
          />
        </div>

        {/* Email detail */}
        <div className="flex-1 overflow-hidden bg-white">
          {selectedEmail ? (
            <EmailDetail
              key={selectedEmail.gmail_id || selectedEmail.id}
              email={selectedEmail}
              onEmailRead={handleEmailRead}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <div className="text-4xl">📬</div>
              <p className="text-sm font-medium text-gray-500">Select an email to read it</p>
              <p className="text-xs">
                {emails.length} email{emails.length !== 1 ? 's' : ''} in inbox
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
