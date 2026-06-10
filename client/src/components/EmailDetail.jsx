import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import ComposeModal from './ComposeModal'

const CATEGORY_COLORS = {
  collab: 'bg-emerald-100 text-emerald-700',
  investor: 'bg-blue-100 text-blue-700',
  advertiser: 'bg-purple-100 text-purple-700',
  platform: 'bg-gray-100 text-gray-600',
  financial: 'bg-yellow-100 text-yellow-700',
  outreach: 'bg-orange-100 text-orange-700',
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('en-AU', {
      weekday: 'short', year: 'numeric', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function EmailDetail({ email, onEmailRead }) {
  const [body, setBody] = useState(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [draftReply, setDraftReply] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [showReplyArea, setShowReplyArea] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [error, setError] = useState('')

  const emailId = email.gmail_id || email.id

  useEffect(() => {
    setBody(null)
    setDraftReply('')
    setShowReplyArea(false)
    setSendSuccess(false)
    setError('')

    if (email.full_body) {
      setBody(email.full_body)
    } else {
      fetchBody()
    }
  }, [emailId])

  async function fetchBody() {
    setBodyLoading(true)
    try {
      const data = await api.get(`/api/emails/${emailId}/body`)
      setBody(data.body)
      if (onEmailRead) onEmailRead(emailId)
    } catch (err) {
      setBody(email.snippet || '')
    } finally {
      setBodyLoading(false)
    }
  }

  async function handleDraftReply() {
    setDraftLoading(true)
    setShowReplyArea(true)
    setDraftReply('')
    setError('')
    try {
      const data = await api.post('/api/ai/draft-reply', { emailId })
      setDraftReply(data.draft)
    } catch (err) {
      setError('Failed to generate draft: ' + err.message)
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleSendReply() {
    if (!draftReply.trim()) return
    setSending(true)
    setError('')
    try {
      await api.post(`/api/emails/${emailId}/reply`, {
        to: email.from_email,
        subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: draftReply,
        threadId: email.thread_id,
      })
      setSendSuccess(true)
      setShowReplyArea(false)
      setDraftReply('')
    } catch (err) {
      setError('Failed to send: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  if (!email) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-bb-border bg-white shrink-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-lg font-semibold text-gray-900 leading-tight">
            {email.subject || '(No subject)'}
          </h2>
          <span className={`category-badge shrink-0 mt-1 ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.outreach}`}>
            {email.category}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>
            <span className="font-medium text-gray-700">
              {email.from_name || email.from_email}
            </span>
            {email.from_name && (
              <span className="ml-1">&lt;{email.from_email}&gt;</span>
            )}
          </span>
          <span>{formatDate(email.date)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* AI Summary */}
        {email.ai_summary && (
          <div className="bg-bb-light border border-bb-border rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-bb-green uppercase tracking-wide mb-1">AI Summary</p>
            <p className="text-sm text-gray-700">{email.ai_summary}</p>
          </div>
        )}

        {/* Email body */}
        <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
          {bodyLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
              Loading email...
            </div>
          ) : (
            body || email.snippet || ''
          )}
        </div>

        {/* Send success */}
        {sendSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
            Reply sent successfully.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Reply area */}
        {showReplyArea && (
          <div className="border border-bb-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-bb-light border-b border-bb-border flex items-center justify-between">
              <span className="text-xs font-semibold text-bb-green uppercase tracking-wide">
                AI Draft Reply
              </span>
              <button
                onClick={() => setShowReplyArea(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            {draftLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
                Generating reply...
              </div>
            ) : (
              <>
                <textarea
                  value={draftReply}
                  onChange={(e) => setDraftReply(e.target.value)}
                  rows={8}
                  className="w-full p-4 text-sm text-gray-800 focus:outline-none resize-none"
                  placeholder="Draft reply..."
                />
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-bb-border">
                  <span className="text-xs text-gray-500">To: {email.from_email}</span>
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !draftReply.trim()}
                    className="btn-primary flex items-center gap-2"
                  >
                    {sending && (
                      <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    {sending ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-6 py-4 border-t border-bb-border bg-white shrink-0 flex items-center gap-3">
        <button
          onClick={handleDraftReply}
          disabled={draftLoading}
          className="btn-primary flex items-center gap-2"
        >
          {draftLoading && (
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
          )}
          Draft Reply
        </button>
        <button
          onClick={() => setShowCompose(true)}
          className="btn-secondary"
        >
          Compose New
        </button>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} />
      )}
    </div>
  )
}
