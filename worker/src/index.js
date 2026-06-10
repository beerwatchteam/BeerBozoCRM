import { signJWT, verifyJWT } from './jwt.js'
import {
  getEmails, getEmail, batchCreateEmails, updateEmail, getStats,
  getChatMessages, createChatMessage,
  createSession, getSession, deleteSession,
} from './db.js'
import {
  getAccessToken, listMessages, getMessage, sendEmail, markAsRead,
  extractHeader, extractBody,
} from './gmail.js'
import { categorizeAndSummarize, draftReply, chatWithPersona } from './anthropic.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function withCors(response, origin) {
  const cors = corsHeaders(origin)
  const headers = new Headers(response.headers)
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

async function withAuth(request, env, handler) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorised' }, 401)
  }

  try {
    const token = authHeader.slice(7)
    const user = await verifyJWT(token, env.JWT_SECRET)

    const session = await getSession(env.DB, user.sessionId)
    if (!session) return json({ error: 'Session expired — please log in again' }, 401)

    const accessToken = await getAccessToken(env, session, env.DB)
    return handler(request, env, user, { ...session, access_token: accessToken })
  } catch (err) {
    return json({ error: err.message }, 401)
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// GET /auth/google
function handleGoogleRedirect(request, env) {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  })

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302)
}

// GET /auth/callback
async function handleGoogleCallback(request, env) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const clientUrl = env.CLIENT_URL || 'http://localhost:5173'

  if (error || !code) {
    return Response.redirect(`${clientUrl}?error=${error || 'no_code'}`, 302)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GMAIL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    })

    const tokens = await tokenRes.json()
    if (!tokens.access_token) throw new Error('No access token received')

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = await profileRes.json()

    // Store session in D1
    const sessionId = crypto.randomUUID()
    await createSession(env.DB, {
      session_id: sessionId,
      user_id: profile.id,
      user_email: profile.email,
      user_name: profile.name,
      user_picture: profile.picture,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    })

    // Issue JWT
    const jwt = await signJWT({
      sub: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      sessionId,
    }, env.JWT_SECRET)

    return Response.redirect(`${clientUrl}/auth/callback?token=${jwt}`, 302)
  } catch (err) {
    console.error('OAuth callback error:', err)
    return Response.redirect(`${env.CLIENT_URL || 'http://localhost:5173'}?error=auth_failed`, 302)
  }
}

// GET /auth/me
async function handleGetMe(request, env, user) {
  return json({ sub: user.sub, email: user.email, name: user.name, picture: user.picture })
}

// POST /auth/logout
async function handleLogout(request, env, user) {
  await deleteSession(env.DB, user.sessionId)
  return json({ success: true })
}

// GET /api/emails
async function handleGetEmails(request, env) {
  const url = new URL(request.url)
  const emails = await getEmails(env.DB, {
    limit: parseInt(url.searchParams.get('limit') || '100'),
    category: url.searchParams.get('category') || undefined,
  })
  return json(emails)
}

// GET /api/emails/stats
async function handleGetStats(request, env) {
  return json(await getStats(env.DB))
}

// POST /api/emails/sync
async function handleSyncEmails(request, env, user, session) {
  const messages = await listMessages(session.access_token, { maxResults: 50, query: 'in:inbox' })
  if (!messages.length) return json({ synced: 0 })

  // Fetch metadata in batches of 10
  const meta = []
  for (let i = 0; i < messages.length; i += 10) {
    const batch = await Promise.all(
      messages.slice(i, i + 10).map(m => getMessage(session.access_token, m.id, 'metadata').catch(() => null))
    )
    meta.push(...batch.filter(Boolean))
  }

  // Find new messages
  const existing = await getEmails(env.DB, { limit: 200 })
  const existingIds = new Set(existing.map(e => e.gmail_id))
  const newMessages = meta.filter(m => !existingIds.has(m.id))

  if (!newMessages.length) return json({ synced: 0 })

  // Process with AI in batches of 5
  const toSave = []
  for (let i = 0; i < newMessages.length; i += 5) {
    const batch = await Promise.all(
      newMessages.slice(i, i + 5).map(async msg => {
        const headers = msg.payload?.headers || []
        const from = extractHeader(headers, 'From')
        const subject = extractHeader(headers, 'Subject')
        const date = extractHeader(headers, 'Date')
        const snippet = msg.snippet || ''
        const isUnread = (msg.labelIds || []).includes('UNREAD')

        const fromMatch = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/)
        const fromName = fromMatch ? fromMatch[1].trim() : ''
        const fromEmail = fromMatch ? (fromMatch[2].trim() || from) : from

        let category = 'outreach', summary = ''
        try {
          const ai = await categorizeAndSummarize(env.ANTHROPIC_API_KEY, { from, subject, snippet })
          category = ai.category
          summary = ai.summary
        } catch (e) {
          console.error('AI error:', e.message)
        }

        return {
          gmail_id: msg.id,
          from_email: fromEmail,
          from_name: fromName,
          subject,
          snippet,
          full_body: null,
          date: date || new Date().toISOString(),
          category,
          is_read: isUnread ? 0 : 1,
          ai_summary: summary,
        }
      })
    )
    toSave.push(...batch)
  }

  const inserted = await batchCreateEmails(env.DB, toSave)
  return json({ synced: inserted })
}

// GET /api/emails/:id/body
async function handleGetEmailBody(request, env, user, session, id) {
  const cached = await getEmail(env.DB, id)
  if (cached?.full_body) {
    await markAsRead(session.access_token, id).catch(() => {})
    await updateEmail(env.DB, id, { is_read: 1 })
    return json({ body: cached.full_body })
  }

  const msg = await getMessage(session.access_token, id, 'full')
  const body = extractBody(msg.payload)

  await Promise.all([
    updateEmail(env.DB, id, { full_body: body, is_read: 1 }),
    markAsRead(session.access_token, id).catch(() => {}),
  ])

  return json({ body })
}

// POST /api/emails/:id/reply
async function handleReply(request, env, user, session, id) {
  const { to, subject, body, threadId, inReplyTo, references } = await request.json()
  if (!to || !body) return json({ error: 'Missing required fields: to, body' }, 400)

  const result = await sendEmail(session.access_token, { to, subject, body, threadId, inReplyTo, references })
  return json({ success: true, messageId: result.id })
}

// POST /api/emails/compose
async function handleCompose(request, env, user, session) {
  const { to, subject, body } = await request.json()
  if (!to || !subject || !body) return json({ error: 'Missing required fields: to, subject, body' }, 400)

  const result = await sendEmail(session.access_token, { to, subject, body })
  return json({ success: true, messageId: result.id })
}

// POST /api/ai/draft-reply
async function handleDraftReply(request, env, user, session) {
  const { emailId } = await request.json()
  if (!emailId) return json({ error: 'emailId is required' }, 400)

  const email = await getEmail(env.DB, emailId)
  if (!email) return json({ error: 'Email not found' }, 404)

  const draft = await draftReply(env.ANTHROPIC_API_KEY, {
    from: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
    subject: email.subject,
    body: email.full_body || email.snippet,
  })

  return json({ draft })
}

// GET /api/chat/:personaId
async function handleGetChat(request, env, user, session, personaId) {
  const messages = await getChatMessages(env.DB, personaId)
  return json(messages)
}

// POST /api/chat/:personaId
async function handlePostChat(request, env, user, session, personaId) {
  const VALID = ['alex', 'mia', 'sam', 'jordan']
  if (!VALID.includes(personaId)) return json({ error: 'Invalid persona' }, 400)

  const { content } = await request.json()
  if (!content?.trim()) return json({ error: 'content is required' }, 400)

  await createChatMessage(env.DB, { persona_id: personaId, role: 'user', content })

  const history = await getChatMessages(env.DB, personaId)
  const context = history.slice(-20)

  const reply = await chatWithPersona(env.ANTHROPIC_API_KEY, personaId, context)
  await createChatMessage(env.DB, { persona_id: personaId, role: 'assistant', content: reply })

  return json({ reply })
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    const origin = request.headers.get('Origin') || ''

    // Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    let response
    try {
      // Auth routes (no JWT required)
      if (path === '/auth/google' && method === 'GET') response = handleGoogleRedirect(request, env)
      else if (path === '/auth/callback' && method === 'GET') response = await handleGoogleCallback(request, env)

      // Protected auth routes
      else if (path === '/auth/me' && method === 'GET') response = await withAuth(request, env, handleGetMe)
      else if (path === '/auth/logout' && method === 'POST') response = await withAuth(request, env, handleLogout)

      // Email routes
      else if (path === '/api/emails/stats' && method === 'GET') response = await withAuth(request, env, handleGetStats)
      else if (path === '/api/emails/sync' && method === 'POST') response = await withAuth(request, env, handleSyncEmails)
      else if (path === '/api/emails/compose' && method === 'POST') response = await withAuth(request, env, handleCompose)
      else if (path === '/api/emails' && method === 'GET') response = await withAuth(request, env, handleGetEmails)

      // Email with ID
      else {
        const bodyMatch = path.match(/^\/api\/emails\/([^/]+)\/body$/)
        const replyMatch = path.match(/^\/api\/emails\/([^/]+)\/reply$/)
        const chatMatch = path.match(/^\/api\/chat\/([^/]+)$/)

        if (bodyMatch && method === 'GET') {
          const id = bodyMatch[1]
          response = await withAuth(request, env, (req, e, u, s) => handleGetEmailBody(req, e, u, s, id))
        } else if (replyMatch && method === 'POST') {
          const id = replyMatch[1]
          response = await withAuth(request, env, (req, e, u, s) => handleReply(req, e, u, s, id))
        } else if (path === '/api/ai/draft-reply' && method === 'POST') {
          response = await withAuth(request, env, handleDraftReply)
        } else if (chatMatch && method === 'GET') {
          const id = chatMatch[1]
          response = await withAuth(request, env, (req, e, u, s) => handleGetChat(req, e, u, s, id))
        } else if (chatMatch && method === 'POST') {
          const id = chatMatch[1]
          response = await withAuth(request, env, (req, e, u, s) => handlePostChat(req, e, u, s, id))
        } else if (path === '/health') {
          response = json({ ok: true })
        } else {
          response = json({ error: 'Not found' }, 404)
        }
      }
    } catch (err) {
      console.error('Unhandled error:', err)
      response = json({ error: err.message || 'Internal server error' }, 500)
    }

    return withCors(response, origin)
  },
}
