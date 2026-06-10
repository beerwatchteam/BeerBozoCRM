import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../firebase'

function getUid() {
  return auth.currentUser?.uid
}

function getGmailToken() {
  return localStorage.getItem('gmail_access_token')
}

function callFn(name) {
  return httpsCallable(functions, name)
}

// Unwraps Cloud Function result and normalises errors
async function invoke(name, data) {
  try {
    const result = await callFn(name)(data)
    return result.data
  } catch (err) {
    // Firebase wraps errors in { code, message } — surface the message
    throw new Error(err?.message || 'Request failed')
  }
}

async function routeGet(path) {
  const uid = getUid()
  if (!uid) throw new Error('Not authenticated')

  // GET /api/emails
  if (path === '/api/emails') {
    const snap = await getDocs(
      query(
        collection(db, `users/${uid}/emails`),
        orderBy('date', 'desc'),
        limit(100)
      )
    )
    return snap.docs.map(d => ({ ...d.data(), id: d.id }))
  }

  // GET /api/emails/stats
  if (path === '/api/emails/stats') {
    const snap = await getDocs(collection(db, `users/${uid}/emails`))
    const emails = snap.docs.map(d => d.data())
    const stats = { total: emails.length, unread: 0, collab: 0, investor: 0, advertiser: 0, platform: 0, outreach: 0 }
    for (const e of emails) {
      if (!e.is_read) stats.unread++
      if (e.category && stats[e.category] !== undefined) stats[e.category]++
    }
    return stats
  }

  // GET /api/emails/:id/body
  const bodyMatch = path.match(/^\/api\/emails\/([^/]+)\/body$/)
  if (bodyMatch) {
    return invoke('getEmailBody', { gmailToken: getGmailToken(), gmailId: bodyMatch[1] })
  }

  // GET /api/chat/:personaId
  const chatMatch = path.match(/^\/api\/chat\/([^/]+)$/)
  if (chatMatch) {
    const personaId = chatMatch[1]
    const snap = await getDocs(
      query(
        collection(db, `users/${uid}/chatMessages`),
        where('persona_id', '==', personaId),
        orderBy('created_at', 'asc'),
        limit(100)
      )
    )
    return snap.docs.map(d => ({ ...d.data(), id: d.id }))
  }

  throw new Error(`Unknown GET path: ${path}`)
}

async function routePost(path, body) {
  const uid = getUid()
  if (!uid) throw new Error('Not authenticated')

  const gmailToken = getGmailToken()

  // POST /api/emails/sync
  if (path === '/api/emails/sync') {
    return invoke('syncEmails', { gmailToken })
  }

  // POST /api/emails/compose
  if (path === '/api/emails/compose') {
    return invoke('sendEmail', { gmailToken, ...body })
  }

  // POST /api/emails/:id/reply
  if (path.match(/^\/api\/emails\/[^/]+\/reply$/)) {
    return invoke('sendEmail', { gmailToken, ...body })
  }

  // POST /api/ai/draft-reply
  if (path === '/api/ai/draft-reply') {
    return invoke('draftReply', body)
  }

  // POST /api/chat/:personaId
  const chatMatch = path.match(/^\/api\/chat\/([^/]+)$/)
  if (chatMatch) {
    return invoke('chat', { personaId: chatMatch[1], ...body })
  }

  throw new Error(`Unknown POST path: ${path}`)
}

export const api = {
  get: (path) => routeGet(path),
  post: (path, body) => routePost(path, body),
}
