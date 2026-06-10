import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import StatsCards from '../components/StatsCards'
import EmailList from '../components/EmailList'
import EmailDetail from '../components/EmailDetail'

const SYNC_INTERVAL_MS = 60 * 1000 // 60 seconds

export default function CRM() {
  const [emails, setEmails] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [filter, setFilter] = useState('all')
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

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
    if (!silent) setSyncing(true)
    try {
      await api.post('/api/emails/sync')
      await Promise.all([loadEmails(), loadStats()])
      setLastSyncedAt(new Date())
    } catch (err) {
      console.error('Sync error:', err)
    } finally {
      if (!silent) setSyncing(false)
    }
  }, [loadEmails, loadStats])

  // On mount: load from DB first (fast), then sync from Gmail
  useEffect(() => {
    const init = async () => {
      await Promise.all([loadEmails(), loadStats()])
      await syncEmails(true)
    }
    init()
  }, [])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => syncEmails(true), SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [syncEmails])

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
      {/* Stats + toolbar */}
      <div className="shrink-0 bg-white border-b border-bb-border">
        <StatsCards stats={stats} />
        <div className="px-6 pb-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {lastSyncedAt
              ? `Last synced ${lastSyncedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
              : 'Syncing...'}
          </span>
          {syncing && (
            <div className="flex items-center gap-1.5 text-xs text-bb-green">
              <div className="w-3 h-3 border border-bb-green border-t-transparent rounded-full animate-spin" />
              Syncing inbox...
            </div>
          )}
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
