import { useState, useEffect, useRef } from 'react'
import { api } from '../utils/api'
import { formatDistanceToNow } from 'date-fns'

export default function InternalChat({ persona }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    loadHistory()
  }, [persona.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadHistory() {
    setHistoryLoading(true)
    setMessages([])
    try {
      const data = await api.get(`/api/chat/${persona.id}`)
      setMessages(data || [])
    } catch (err) {
      setError('Could not load chat history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleSend() {
    const content = input.trim()
    if (!content || loading) return

    setInput('')
    setError('')

    // Optimistic user message
    const tempMessage = {
      id: `temp-${Date.now()}`,
      persona_id: persona.id,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMessage])
    setLoading(true)

    try {
      const data = await api.post(`/api/chat/${persona.id}`, { content })

      const assistantMessage = {
        id: `temp-ai-${Date.now()}`,
        persona_id: persona.id,
        role: 'assistant',
        content: data.reply,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      setError('Failed to get response: ' + err.message)
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Persona header */}
      <div className="px-6 py-4 border-b border-bb-border bg-bb-light shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-bb-green text-white flex items-center justify-center font-bold text-sm">
            {persona.name[0]}
          </div>
          <div>
            <div className="font-semibold text-bb-green text-sm">{persona.name}</div>
            <div className="text-xs text-gray-500">{persona.title}</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {historyLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
            <div className="w-12 h-12 rounded-full bg-bb-light border border-bb-border flex items-center justify-center text-xl mb-3">
              {persona.emoji}
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">Start a conversation with {persona.name}</p>
            <p className="text-xs text-gray-400">{persona.description}</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-bb-green text-white flex items-center justify-center font-bold text-xs mr-2 mt-1 shrink-0">
                  {persona.name[0]}
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-bb-green text-white rounded-br-sm'
                    : 'bg-white border border-bb-border text-gray-800 rounded-bl-sm'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-green-200' : 'text-gray-400'}`}>
                  {msg.created_at ? formatDistanceToNow(new Date(msg.created_at), { addSuffix: true }) : ''}
                </p>
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-bb-green text-white flex items-center justify-center font-bold text-xs mr-2 mt-1 shrink-0">
              {persona.name[0]}
            </div>
            <div className="bg-white border border-bb-border px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-bb-border bg-white shrink-0">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${persona.name}...`}
            rows={1}
            className="flex-1 border border-bb-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green/30 focus:border-bb-green resize-none min-h-[44px] max-h-32"
            style={{ overflowY: 'auto' }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="btn-primary h-10 px-5 shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  )
}
