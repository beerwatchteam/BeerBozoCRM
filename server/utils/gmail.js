const { google } = require('googleapis')

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  )
}

function getAuthenticatedClient(tokens) {
  const auth = getOAuth2Client()
  auth.setCredentials(tokens)

  // Auto-refresh: persist new tokens back to the store
  auth.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) {
      tokens.refresh_token = newTokens.refresh_token
    }
    tokens.access_token = newTokens.access_token
    tokens.expiry_date = newTokens.expiry_date
  })

  return auth
}

function extractHeader(headers, name) {
  const h = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())
  return h ? h.value : ''
}

function extractBody(payload) {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64url').toString('utf-8')
    return stripHtml(html)
  }

  if (payload.parts) {
    // Prefer plain text
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf-8')
    }

    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) {
      return stripHtml(Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8'))
    }

    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }

  return ''
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

async function listMessages(auth, { maxResults = 50, query = 'in:inbox' } = {}) {
  const gmail = google.gmail({ version: 'v1', auth })
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
  })
  return res.data.messages || []
}

async function getMessage(auth, messageId, format = 'metadata') {
  const gmail = google.gmail({ version: 'v1', auth })
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format,
    ...(format === 'metadata' ? { metadataHeaders: ['From', 'Subject', 'Date', 'Message-ID', 'References', 'In-Reply-To'] } : {}),
  })
  return res.data
}

async function sendEmail(auth, { to, subject, body, threadId, inReplyTo, references }) {
  const gmail = google.gmail({ version: 'v1', auth })

  const headerLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ]

  if (inReplyTo) headerLines.push(`In-Reply-To: ${inReplyTo}`)
  if (references) headerLines.push(`References: ${references}`)

  const raw = Buffer.from(headerLines.join('\r\n') + '\r\n\r\n' + body).toString('base64url')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      ...(threadId ? { threadId } : {}),
    },
  })

  return res.data
}

async function markAsRead(auth, messageId) {
  const gmail = google.gmail({ version: 'v1', auth })
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  })
}

module.exports = {
  getOAuth2Client,
  getAuthenticatedClient,
  extractHeader,
  extractBody,
  listMessages,
  getMessage,
  sendEmail,
  markAsRead,
}
