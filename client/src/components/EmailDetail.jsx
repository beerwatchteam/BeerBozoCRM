import { useState, useEffect, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { api } from '../utils/api'
import ComposeModal from './ComposeModal'
import WorkflowTimeline from './WorkflowTimeline'

const CATEGORY_COLORS = {
  collab:     'bg-emerald-100 text-emerald-700',
  investor:   'bg-blue-100 text-blue-700',
  advertiser: 'bg-purple-100 text-purple-700',
  platform:   'bg-gray-100 text-gray-600',
  financial:  'bg-yellow-100 text-yellow-700',
  outreach:   'bg-orange-100 text-orange-700',
}

const WORKFLOW_STAGES = {
  advertiser: [
    'Initial Contact', 'Awaiting Response', 'Deal Discussion', 'Deal Agreed',
    'Awaiting Assets', 'Invoice Sent / Awaiting Payment', 'Live & Active', 'Completed',
  ],
  collab: [
    'Initial Contact', 'Brief Sent', 'Content Received', 'Revision', 'Approved', 'Published',
  ],
  investor: [
    'Initial Contact', 'Intro Meeting', 'Pitch Sent', 'Due Diligence', 'Term Sheet', 'Closed',
  ],
}

const WORKFLOW_CATEGORIES = new Set(['advertiser', 'collab', 'investor'])

const ALL_CATEGORIES = ['collab', 'investor', 'advertiser', 'platform', 'financial', 'outreach']

function CategoryDropdown({ currentCategory, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className={`category-badge cursor-pointer hover:opacity-80 transition-opacity ${CATEGORY_COLORS[currentCategory] || CATEGORY_COLORS.outreach}`}
        title="Click to change category"
      >
        {currentCategory} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-card-lg border border-bb-border py-1 z-50 min-w-[140px]">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => { onSelect(cat); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-bb-light transition-colors capitalize ${
                cat === currentCategory ? 'text-bb-green' : 'text-gray-700'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${CATEGORY_COLORS[cat]?.split(' ')[0]}`} />
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('en-AU', {
      weekday: 'short', year: 'numeric', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return dateStr }
}

export default function EmailDetail({ email, onEmailRead, onCategoryChange }) {
  const [body, setBody]                   = useState(null)
  const [bodyLoading, setBodyLoading]     = useState(false)
  const [draftReply, setDraftReply]       = useState('')
  const [draftLoading, setDraftLoading]   = useState(false)
  const [showReplyArea, setShowReplyArea] = useState(false)
  const [sending, setSending]             = useState(false)
  const [sendSuccess, setSendSuccess]     = useState(false)
  const [showCompose, setShowCompose]     = useState(false)
  const [error, setError]                 = useState('')
  const [workflowStage, setWorkflowStage]     = useState(0)
  const [aiAssessing, setAiAssessing]         = useState(false)
  const [currentCategory, setCurrentCategory] = useState(email.category)

  const emailId = email.gmail_id || email.id
  const hasWorkflow = WORKFLOW_CATEGORIES.has(currentCategory)
  const workflowStages = WORKFLOW_STAGES[currentCategory] || []

  useEffect(() => {
    setBody(null)
    setDraftReply('')
    setShowReplyArea(false)
    setSendSuccess(false)
    setError('')
    setWorkflowStage(email.workflow_stage_index ?? 0)
    setCurrentCategory(email.category)

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
    } catch {
      setBody(email.snippet || '')
    } finally {
      setBodyLoading(false)
    }
  }

  async function handleCategoryChange(newCategory) {
    setCurrentCategory(newCategory)
    try {
      await api.put(`/api/emails/${emailId}/category`, { category: newCategory })
      if (onCategoryChange) onCategoryChange(emailId, newCategory)
    } catch (err) {
      console.error('Category update error:', err)
      setCurrentCategory(email.category) // revert on error
    }
  }

  async function handleStageClick(index) {
    setWorkflowStage(index)
    const uid = auth.currentUser?.uid
    if (!uid) return
    await updateDoc(doc(db, `users/${uid}/emails`, emailId), {
      workflow_stage_index: index,
    }).catch(() => {})
  }

  async function handleAIAssess() {
    setAiAssessing(true)
    try {
      const result = await api.post('/api/ai/assess-email-stage', {
        emailId,
        category: email.category,
      })
      const idx = result.stageIndex ?? 0
      setWorkflowStage(idx)
      const uid = auth.currentUser?.uid
      if (uid) {
        await updateDoc(doc(db, `users/${uid}/emails`, emailId), {
          workflow_stage_index: idx,
        }).catch(() => {})
      }
    } catch (err) {
      console.error('AI assess error:', err)
    } finally {
      setAiAssessing(false)
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
    <div className="flex h-full overflow-hidden">
      {/* ── Main email column ────────────────────────── */}
      <div className={`flex flex-col overflow-hidden ${hasWorkflow ? 'flex-1' : 'w-full'}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-bb-border bg-white shrink-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">
              {email.subject || '(No subject)'}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              {email.needs_review && (
                <span className="category-badge bg-amber-100 text-amber-700 text-[10px]">
                  Needs review
                </span>
              )}
              <CategoryDropdown
                currentCategory={currentCategory}
                onSelect={handleCategoryChange}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>
              <span className="font-medium text-gray-700">{email.from_name || email.from_email}</span>
              {email.from_name && <span className="ml-1 text-xs">&lt;{email.from_email}&gt;</span>}
            </span>
            <span className="text-xs">{formatDate(email.date)}</span>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* AI summary */}
          {email.ai_summary && (
            <div className="bg-bb-green-light border border-bb-green/20 rounded-xl px-4 py-3">
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
            ) : body || email.snippet || ''}
          </div>

          {sendSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
              Reply sent successfully.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {showReplyArea && (
            <div className="border border-bb-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-bb-light border-b border-bb-border flex items-center justify-between">
                <span className="text-xs font-semibold text-bb-green uppercase tracking-wide">AI Draft Reply</span>
                <button onClick={() => setShowReplyArea(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
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
                    onChange={e => setDraftReply(e.target.value)}
                    rows={7}
                    className="w-full p-4 text-sm text-gray-800 focus:outline-none resize-none"
                    placeholder="Draft reply..."
                  />
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-bb-border">
                    <span className="text-xs text-gray-500">To: {email.from_email}</span>
                    <button onClick={handleSendReply} disabled={sending || !draftReply.trim()} className="btn-primary flex items-center gap-2">
                      {sending && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                      {sending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="px-5 py-3 border-t border-bb-border bg-white shrink-0 flex items-center gap-2">
          <button onClick={handleDraftReply} disabled={draftLoading} className="btn-primary flex items-center gap-2">
            {draftLoading && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
            Draft Reply
          </button>
          <button onClick={() => setShowCompose(true)} className="btn-secondary">Compose New</button>
        </div>
      </div>

      {/* ── Workflow panel (advertiser / collab / investor) ── */}
      {hasWorkflow && (
        <div className="w-[280px] shrink-0 border-l border-bb-border bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-bb-border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {currentCategory} workflow
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Click a stage to update</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <WorkflowTimeline
              stageNames={workflowStages}
              activeIndex={workflowStage}
              onStageClick={handleStageClick}
              onAIAssess={handleAIAssess}
              aiAssessing={aiAssessing}
            />
          </div>
        </div>
      )}

      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} />}
    </div>
  )
}
