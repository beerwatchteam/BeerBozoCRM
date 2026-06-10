// Thin client for the Cloudflare D1 Worker
const fetch = require('node:http') // use built-in, overridden below for clarity

const BASE_URL = () => process.env.WORKER_URL || 'http://localhost:8787'
const SECRET = () => process.env.WORKER_SECRET || ''

async function workerFetch(path, { method = 'GET', body } = {}) {
  const url = `${BASE_URL()}${path}`
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': SECRET(),
    },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await globalThis.fetch(url, opts)
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Worker request failed: ${res.status}`)
  }

  return data
}

const db = {
  getEmails: (params = {}) => {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', params.limit)
    if (params.offset) qs.set('offset', params.offset)
    if (params.category) qs.set('category', params.category)
    return workerFetch(`/emails?${qs}`)
  },

  getEmail: (id) => workerFetch(`/emails/${id}`),

  createEmail: (email) => workerFetch('/emails', { method: 'POST', body: email }),

  batchCreateEmails: (emails) => workerFetch('/emails/batch', { method: 'POST', body: emails }),

  updateEmail: (id, updates) => workerFetch(`/emails/${id}`, { method: 'PUT', body: updates }),

  getStats: () => workerFetch('/stats'),

  getChatMessages: (personaId) => workerFetch(`/chat-messages/${personaId}`),

  createChatMessage: (msg) => workerFetch('/chat-messages', { method: 'POST', body: msg }),
}

module.exports = db
