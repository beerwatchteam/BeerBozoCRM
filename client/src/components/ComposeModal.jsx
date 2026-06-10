import { useState } from 'react'
import { api } from '../utils/api'

export default function ComposeModal({ onClose }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setError('Please fill in all fields.')
      return
    }
    setSending(true)
    setError('')
    try {
      await api.post('/api/emails/compose', { to, subject, body })
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError('Failed to send: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-bb-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bb-border bg-bb-light">
          <h3 className="font-semibold text-bb-green">New Email</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Fields */}
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full border border-bb-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green/30 focus:border-bb-green"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full border border-bb-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green/30 focus:border-bb-green"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your message..."
              className="w-full border border-bb-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green/30 focus:border-bb-green resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Email sent successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-bb-border bg-gray-50">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="btn-primary flex items-center gap-2"
          >
            {sending && (
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            )}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
