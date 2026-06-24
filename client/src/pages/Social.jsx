import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { SparklesIcon } from '../components/Icons'

const TABS = ['Overview', 'Create Post', 'Scheduled', 'Analytics']

// ---------------------------------------------------------------------------
// Platform icons (inline SVG, brand-coloured fills)
// ---------------------------------------------------------------------------

function InstagramIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function TikTokIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.88a8.3 8.3 0 004.86 1.56V7c-.01 0-1.7-.01-3.09-1.31z" />
    </svg>
  )
}

function FacebookIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

const PLATFORM_META = {
  Instagram: { Icon: InstagramIcon, color: 'text-pink-400',  bg: 'bg-pink-500/10',  border: 'border-pink-500/20'  },
  TikTok:    { Icon: TikTokIcon,    color: 'text-white',     bg: 'bg-white/5',       border: 'border-white/15'     },
  Facebook:  { Icon: FacebookIcon,  color: 'text-blue-400',  bg: 'bg-blue-500/10',  border: 'border-blue-500/20'  },
}

function platformMeta(rawService) {
  if (!rawService) return PLATFORM_META.Instagram
  const key = rawService.charAt(0).toUpperCase() + rawService.slice(1).toLowerCase()
  return PLATFORM_META[key] || PLATFORM_META.Instagram
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview() {
  const [stats, setStats]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState(null)
  const [notConnected, setNotConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  async function load() {
    try {
      const data = await api.post('/api/social/stats', {})
      setStats(data || [])
      setNotConnected(false)
      setError(null)
    } catch (err) {
      if (err.message?.includes('Buffer not connected')) {
        setNotConnected(true)
      } else {
        setError(err.message)
      }
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const redirectUri = window.location.origin + '/auth/buffer/callback'
      const data = await api.post('/api/buffer/auth-url', { redirectUri })
      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setConnecting(false)
    }
  }

  // Build lookup by normalised platform name
  const statsMap = {}
  for (const s of stats) {
    const key = s.platform ? s.platform.charAt(0).toUpperCase() + s.platform.slice(1).toLowerCase() : ''
    if (key) statsMap[key] = s
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Platform Status</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          {refreshing ? 'Refreshing...' : 'Refresh stats'}
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : notConnected ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-3xl">🔗</div>
          <p className="text-white font-semibold text-sm">Buffer not connected</p>
          <p className="text-gray-500 text-xs text-center max-w-xs">
            Connect your Buffer account to see platform stats, schedule posts, and view analytics.
          </p>
          <button onClick={handleConnect} disabled={connecting} className="btn-primary">
            {connecting ? 'Redirecting...' : 'Connect Buffer'}
          </button>
        </div>
      ) : error ? (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {['Instagram', 'TikTok', 'Facebook'].map(platform => {
            const meta = PLATFORM_META[platform]
            const stat = statsMap[platform]
            const connected = !!stat?.connected
            return (
              <div key={platform} className={`rounded-xl border p-4 ${meta.bg} ${meta.border}`}>
                <div className="flex items-center gap-3 mb-3">
                  <meta.Icon className={`w-6 h-6 ${meta.color}`} />
                  <span className="text-white font-semibold text-sm">{platform}</span>
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                    connected
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-white/10 text-gray-400'
                  }`}>
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                {connected && stat ? (
                  <div className="space-y-0.5">
                    {stat.name && <p className="text-xs text-gray-400">@{stat.name}</p>}
                    {stat.followerCount != null && (
                      <p className="text-xl font-bold text-white">
                        {stat.followerCount.toLocaleString()}
                        <span className="text-xs font-normal text-gray-400 ml-1">followers</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Connect via Buffer to see stats</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Post
// ---------------------------------------------------------------------------

function CreatePost() {
  const [selectedPlatforms, setSelectedPlatforms] = useState([])
  const [topic, setTopic]         = useState('')
  const [caption, setCaption]     = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [scheduling, setScheduling]   = useState(false)
  const [error, setError]   = useState(null)
  const [success, setSuccess] = useState(null)

  function togglePlatform(p) {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  async function handleGenerate() {
    if (!topic.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const data = await api.post('/api/social/generate-caption', { topic, platforms: selectedPlatforms })
      setCaption(data.caption || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSchedule() {
    if (!caption.trim() || !scheduledAt || selectedPlatforms.length === 0) return
    setScheduling(true)
    setError(null)
    setSuccess(null)
    try {
      await api.post('/api/social/schedule', { caption, platforms: selectedPlatforms, scheduledAt })
      setSuccess('Post scheduled successfully via Buffer!')
      setCaption('')
      setTopic('')
      setScheduledAt('')
      setSelectedPlatforms([])
    } catch (err) {
      setError(err.message)
    } finally {
      setScheduling(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Platform selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Platforms</label>
        <div className="flex gap-2 flex-wrap">
          {['Instagram', 'TikTok', 'Facebook'].map(p => {
            const meta = PLATFORM_META[p]
            const selected = selectedPlatforms.includes(p)
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  selected
                    ? 'bg-bb-green border-bb-green text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <meta.Icon className="w-4 h-4" />
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {/* Topic + Generate */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Topic</label>
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            placeholder="What's this post about?"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-bb-green"
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-bb-green hover:border-bb-green/50 transition-all disabled:opacity-40 shrink-0"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            {generating ? 'Generating...' : 'Generate caption'}
          </button>
        </div>
      </div>

      {/* Caption */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Caption</label>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Your caption will appear here, or write your own..."
          rows={6}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-bb-green resize-none"
        />
      </div>

      {/* Schedule time */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Schedule time</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-bb-green [color-scheme:dark]"
        />
      </div>

      {error   && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}

      <div>
        <button
          onClick={handleSchedule}
          disabled={scheduling || !caption.trim() || !scheduledAt || selectedPlatforms.length === 0}
          className="btn-primary"
        >
          {scheduling ? 'Scheduling...' : 'Schedule via Buffer'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scheduled
// ---------------------------------------------------------------------------

function Scheduled() {
  const [posts, setPosts]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    api.post('/api/social/scheduled', {})
      .then(data => setPosts(data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  if (error) return (
    <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
  )

  if (posts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
      <div className="text-3xl">📅</div>
      <p className="text-sm">No scheduled posts</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      {posts.map(post => {
        const meta = platformMeta(post.platform)
        return (
          <div key={post.id} className="flex items-start gap-3 p-4 rounded-xl bg-[#1a1f2e] border border-white/10">
            <meta.Icon className={`w-5 h-5 shrink-0 mt-0.5 ${meta.color}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 leading-snug">
                {post.text && post.text.length > 80 ? post.text.slice(0, 80) + '…' : post.text}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {post.scheduledAt
                  ? new Date(post.scheduledAt).toLocaleString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </p>
            </div>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium capitalize">
              {post.status || 'scheduled'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

function Analytics() {
  const [data, setData]                     = useState(null)
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [upgradeRequired, setUpgradeRequired] = useState(false)

  useEffect(() => {
    api.post('/api/social/analytics', {})
      .then(result => {
        if (result?.error === 'upgrade_required') {
          setUpgradeRequired(true)
        } else {
          setData(result)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  if (upgradeRequired) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center max-w-sm mx-auto">
      <div className="text-3xl">📊</div>
      <p className="text-white font-semibold text-sm">Analytics require a Buffer paid plan</p>
      <p className="text-gray-500 text-xs leading-relaxed">
        Full analytics (impressions, clicks, best performing posts) are only available on Buffer's Essentials plan or above.
        Upgrade your Buffer account to unlock these insights.
      </p>
    </div>
  )

  if (error) return (
    <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
  )

  if (!data) return null

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Per-platform follower counts */}
      {data.platformBreakdown && Object.keys(data.platformBreakdown).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(data.platformBreakdown).map(([platform, info]) => {
            const meta = PLATFORM_META[platform] || PLATFORM_META.Instagram
            return (
              <div key={platform} className={`rounded-xl border p-4 ${meta.bg} ${meta.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <meta.Icon className={`w-4 h-4 ${meta.color}`} />
                  <span className="text-sm font-semibold text-white">{platform}</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {info.followers != null ? info.followers.toLocaleString() : '—'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">followers</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#1a1f2e] border border-white/10 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Posts this month</p>
          <p className="text-2xl font-bold text-white">{data.totalPosts ?? '—'}</p>
        </div>
        {data.bestPost && (
          <div className="rounded-xl bg-[#1a1f2e] border border-white/10 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Best performing post</p>
            <p className="text-sm text-gray-200 leading-snug line-clamp-3">{data.bestPost.text}</p>
            {data.bestPost.impressions != null && (
              <p className="text-xs text-gray-500 mt-1">{data.bestPost.impressions.toLocaleString()} impressions</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Social page
// ---------------------------------------------------------------------------

export default function Social() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <div className="h-full flex flex-col bg-[#111827] overflow-hidden">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center gap-1.5 px-5 py-3 border-b border-white/10">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-bb-green text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {activeTab === 'Overview'    && <Overview />}
        {activeTab === 'Create Post' && <CreatePost />}
        {activeTab === 'Scheduled'   && <Scheduled />}
        {activeTab === 'Analytics'   && <Analytics />}
      </div>
    </div>
  )
}
