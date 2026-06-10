import { updateSessionToken } from './db.js'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Get a valid (possibly refreshed) access token
export async function getAccessToken(env, session, db) {
  const bufferMs = 5 * 60 * 1000 // refresh 5 min before expiry
  if (session.expiry_date && session.expiry_date < Date.now() + bufferMs) {
    if (!session.refresh_token) return session.access_token

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: session.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    })

    const data = await res.json()
    if (!data.access_token) return session.access_token

    const expiry = Date.now() + (data.expires_in || 3600) * 1000
    await updateSessionToken(db, session.session_id, data.access_token, expiry)
    return data.access_token
  }
  return session.access_token
}

async function gmailFetch(accessToken, path, options = {}) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gmail API error ${res.status}: ${err?.error?.message || res.statusText}`)
  }
  return res.json()
}

export async function listMessages(accessToken, { maxResults = 50, query = 'in:inbox' } = {}) {
  const params = new URLSearchParams({ maxResults: String(maxResults), q: query })
  const data = await gmailFetch(accessToken, `/messages?${params}`)
  return data.messages || []
}

export async function getMessage(accessToken, messageId, format = 'metadata') {
  const params = new URLSearchParams({ format })
  if (format === 'metadata') {
    params.set('metadataHeaders', 'From')
    // URLSearchParams doesn't support repeated keys cleanly — use append
    const url = `/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`
    return gmailFetch(accessToken, url)
  }
  return gmailFetch(accessToken, `/messages/${messageId}?format=full`)
}

export async function sendEmail(accessToken, { to, subject, body, threadId, inReplyTo, references }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ]
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`)
  if (references) lines.push(`References: ${references}`)

  const raw = strToBase64url(lines.join('\r\n') + '\r\n\r\n' + body)

  return gmailFetch(accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  })
}

export async function markAsRead(accessToken, messageId) {
  return gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

export function extractHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

export function extractBody(payload) {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64urlToUtf8(payload.body.data)
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(base64urlToUtf8(payload.body.data))
  }
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) return base64urlToUtf8(plain.body.data)

    const html = payload.parts.find(p => p.mimeType === 'text/html')
    if (html?.body?.data) return stripHtml(base64urlToUtf8(html.body.data))

    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }
  return ''
}

// --- helpers ---

function base64urlToUtf8(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)))
  return new TextDecoder('utf-8').decode(bytes)
}

function strToBase64url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach(b => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
