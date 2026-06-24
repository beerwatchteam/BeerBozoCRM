// v2 — CORS + financial category
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()

const anthropicKey = defineSecret('ANTHROPIC_API_KEY')

// Buffer personal access token — set via:
//   firebase functions:secrets:set BUFFER_ACCESS_TOKEN
const bufferAccessToken = defineSecret('BUFFER_ACCESS_TOKEN')

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

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
    const status = res.status
    if (status === 401) throw new HttpsError('unauthenticated', 'Gmail token expired — please sign in again')
    throw new HttpsError('internal', `Gmail API error ${status}: ${err?.error?.message || res.statusText}`)
  }
  return res.json()
}

async function listMessages(accessToken, { maxResults = 50, query = 'in:inbox' } = {}) {
  const params = new URLSearchParams({ maxResults: String(maxResults), q: query })
  const data = await gmailFetch(accessToken, `/messages?${params}`)
  return data.messages || []
}

async function getMessage(accessToken, messageId, format = 'metadata') {
  if (format === 'metadata') {
    const url = `/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Thread-ID`
    return gmailFetch(accessToken, url)
  }
  return gmailFetch(accessToken, `/messages/${messageId}?format=full`)
}

async function sendGmail(accessToken, { to, subject, body, threadId, inReplyTo, references }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ]
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`)
  if (references) lines.push(`References: ${references}`)

  const raw = Buffer.from(lines.join('\r\n') + '\r\n\r\n' + body, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return gmailFetch(accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  })
}

async function markAsRead(accessToken, messageId) {
  return gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

function extractHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return base64urlToUtf8(payload.body.data)
  if (payload.mimeType === 'text/html' && payload.body?.data) return stripHtml(base64urlToUtf8(payload.body.data))
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

function base64urlToUtf8(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf-8')
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

// ---------------------------------------------------------------------------
// Anthropic helpers
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-5'
const CATEGORIES = ['collab', 'investor', 'advertiser', 'platform', 'financial', 'outreach']

async function callClaude(apiKey, { system, messages, maxTokens = 512 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new HttpsError('internal', `Anthropic error ${res.status}: ${err?.error?.message || res.statusText}`)
  }
  const data = await res.json()
  return data.content[0].text.trim()
}

async function categorizeAndSummarize(apiKey, { from, subject, snippet }) {
  const prompt = `You are an AI assistant for BeerBozo — an Australian app that shows cheapest drink prices at pubs and bars.

Analyse this email and return a JSON object with exactly these two fields:
- "category": one of ${CATEGORIES.join(', ')} (collab=collaboration/partnership, investor=investment interest, advertiser=wanting to advertise, platform=tech/platform related, financial=invoices/billing/payments/accounting, outreach=general/cold/other)
- "summary": 1-2 sentences — what is it about and what action is needed

Email:
From: ${from}
Subject: ${subject}
Body: ${(snippet || '').slice(0, 1000)}

Return ONLY valid JSON, no other text.`

  try {
    const text = await callClaude(apiKey, {
      maxTokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = JSON.parse(text)
    return {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'outreach',
      summary: parsed.summary || '',
    }
  } catch {
    return { category: 'outreach', summary: '' }
  }
}

const PERSONA_PROMPTS = {
  alex: 'You are Alex, CEO of BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You are a strategic advisor to the founder. Focus on growth strategy, fundraising, key partnerships, and high-level decisions. Be direct, commercially minded, and cut through the noise.',
  mia: 'You are Mia, Head of Marketing at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle social media, content strategy, influencer collabs, and user acquisition. Be creative, practical, and grounded in what works for indie apps.',
  sam: 'You are Sam, Head of Design at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle UI/UX, brand identity, and visual design. Think visually, prioritise usability, and work within the constraints of a small team.',
  jordan: 'You are Jordan, Head of Commercial at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle advertiser partnerships, pub/bar onboarding, revenue streams, and investor relations. Be sharp and commercially focused.',
}

// ---------------------------------------------------------------------------
// Workflow stages per category
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Rule-based categorisation + Advertiser stages
// ---------------------------------------------------------------------------

const ADVERTISER_STAGES = [
  'Initial Contact',
  'Awaiting Response',
  'Deal Discussion',
  'Deal Agreed',
  'Awaiting Assets',
  'Invoice Sent / Awaiting Payment',
  'Live & Active',
  'Completed',
]

// Returns { category, needsReview }
// Matches sender domain (from_email) and subject only — no AI, no snippet
function ruleBasedCategory(fromEmail, subject) {
  const from = (fromEmail || '').toLowerCase()
  const sub  = (subject  || '').toLowerCase()

  // ── FINANCIAL ──────────────────────────────────────────────────────────
  const financialDomains = [
    '@google.com', '@apple.com', '@googleadmob.com', '@firebase.google.com',
    '@cloudflare.com', '@xero.com', '@myob.com', '@ato.gov.au',
    '@paypal.com', '@stripe.com',
  ]
  const financialKeywords = [
    'invoice', 'payment', 'receipt', 'billing', 'bill',
    'subscription', 'tax', 'statement', 'overdue', 'refund',
    'charge', 'transaction', 'account balance', 'direct debit', 'remittance',
  ]
  if (financialDomains.some(d => from.includes(d)) || financialKeywords.some(k => sub.includes(k))) {
    return { category: 'financial', needsReview: false }
  }

  // ── PLATFORM ────────────────────────────────────────────────────────────
  const platformDomains = [
    '@github.com', '@firebase.google.com', '@cloudflare.com',
    '@admob.google.com', '@developer.apple.com',
    '@appstoreconnect.apple.com', '@testflight.apple.com',
  ]
  const platformKeywords = [
    'app store', 'google play', 'admob', 'firebase',
    'cloudflare', 'github', 'testflight', 'app review',
    'developer', 'deployment', 'build', 'crash',
    'update approved', 'update rejected', 'new version', 'release',
  ]
  if (platformDomains.some(d => from.includes(d)) || platformKeywords.some(k => sub.includes(k))) {
    return { category: 'platform', needsReview: false }
  }

  // ── INVESTOR ─────────────────────────────────────────────────────────────
  const investorKeywords = [
    'invest', 'investment', 'investor', 'funding',
    'capital', 'raise', 'venture', 'angel', 'seed',
    'pitch', 'term sheet', 'equity', 'shareholder',
    'due diligence', 'valuation',
  ]
  if (investorKeywords.some(k => sub.includes(k))) {
    return { category: 'investor', needsReview: false }
  }

  // ── ADVERTISER ───────────────────────────────────────────────────────────
  const advertiserKeywords = [
    'advertise', 'advertising', 'advertisement',
    'sponsor', 'sponsorship', 'ad campaign', 'ad space',
    'listing', 'featured', 'promotion', 'paid partnership',
    'rate card', 'media kit', 'cpm', 'cpc',
  ]
  if (advertiserKeywords.some(k => sub.includes(k))) {
    return { category: 'advertiser', needsReview: false }
  }

  // ── COLLAB ───────────────────────────────────────────────────────────────
  const collabKeywords = [
    'collab', 'collaborate', 'collaboration',
    'partnership', 'content creator', 'influencer',
    'tiktok', 'instagram', 'social media', 'feature',
    'cross promote', 'shoutout', 'ambassador', 'creator', 'ugc',
  ]
  if (collabKeywords.some(k => sub.includes(k))) {
    return { category: 'collab', needsReview: false }
  }

  // ── OUTREACH (default) — flag if subject contains urgency words ───────────
  const reviewKeywords = [
    'urgent', 'important', 'action required', 'response needed', 'follow up',
  ]
  const needsReview = reviewKeywords.some(k => sub.includes(k))
  return { category: 'outreach', needsReview }
}

// ---------------------------------------------------------------------------
// Cloud Functions
// ---------------------------------------------------------------------------

exports.syncEmails = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const uid = request.auth.uid
  const { gmailToken } = request.data
  if (!gmailToken) throw new HttpsError('invalid-argument', 'gmailToken is required')

  const messages = await listMessages(gmailToken, { maxResults: 200, query: 'in:inbox' })
  if (!messages.length) return { synced: 0 }

  // Fetch metadata in batches of 10
  const meta = []
  for (let i = 0; i < messages.length; i += 10) {
    const batch = await Promise.all(
      messages.slice(i, i + 10).map(m => getMessage(gmailToken, m.id, 'metadata').catch(() => null))
    )
    meta.push(...batch.filter(Boolean))
  }

  // Find new messages (check against existing Firestore docs)
  const emailsRef = db.collection(`users/${uid}/emails`)
  const snapshot = await emailsRef.select().get()
  const existingIds = new Set(snapshot.docs.map(d => d.id))
  const newMessages = meta.filter(m => !existingIds.has(m.id))

  if (!newMessages.length) return { synced: 0 }

  // Rules-only categorisation — no AI, fast and free
  const toSave = newMessages.map(msg => {
    const headers = msg.payload?.headers || []
    const from    = extractHeader(headers, 'From')
    const subject = extractHeader(headers, 'Subject')
    const date    = extractHeader(headers, 'Date')
    const snippet = msg.snippet || ''
    const isUnread = (msg.labelIds || []).includes('UNREAD')

    const fromMatch = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/)
    const fromName  = fromMatch ? fromMatch[1].trim() : ''
    const fromEmail = fromMatch ? (fromMatch[2].trim() || from) : from

    const { category, needsReview } = ruleBasedCategory(fromEmail, subject)
    const parsedDate = date ? new Date(date).toISOString() : new Date().toISOString()

    return {
      gmail_id: msg.id,
      thread_id: msg.threadId || null,
      from_email: fromEmail,
      from_name: fromName,
      subject,
      snippet,
      full_body: null,
      date: parsedDate,
      category,
      needs_review: needsReview,
      is_read: isUnread ? 0 : 1,
      ai_summary: '',
      created_at: new Date().toISOString(),
    }
  })

  // Batch write to Firestore (max 500 per batch)
  const batchWrite = db.batch()
  for (const email of toSave) {
    const ref = emailsRef.doc(email.gmail_id)
    batchWrite.set(ref, email)
  }
  await batchWrite.commit()

  return { synced: toSave.length }
})

exports.getEmailBody = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const uid = request.auth.uid
  const { gmailToken, gmailId } = request.data
  if (!gmailToken || !gmailId) throw new HttpsError('invalid-argument', 'gmailToken and gmailId are required')

  // Serve from Firestore cache if available
  const docRef = db.doc(`users/${uid}/emails/${gmailId}`)
  const docSnap = await docRef.get()
  if (docSnap.exists && docSnap.data().full_body) {
    await markAsRead(gmailToken, gmailId).catch(() => {})
    await docRef.update({ is_read: 1 })
    return { body: docSnap.data().full_body }
  }

  const msg = await getMessage(gmailToken, gmailId, 'full')
  const body = extractBody(msg.payload)

  await Promise.all([
    docSnap.exists
      ? docRef.update({ full_body: body, is_read: 1 })
      : docRef.set({ full_body: body, is_read: 1, gmail_id: gmailId }, { merge: true }),
    markAsRead(gmailToken, gmailId).catch(() => {}),
  ])

  return { body }
})

exports.sendEmail = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const { gmailToken, to, subject, body, threadId, inReplyTo, references } = request.data
  if (!gmailToken || !to || !body) {
    throw new HttpsError('invalid-argument', 'gmailToken, to, and body are required')
  }

  const result = await sendGmail(gmailToken, { to, subject, body, threadId, inReplyTo, references })
  return { success: true, messageId: result.id }
})

exports.draftReply = onCall({ secrets: [anthropicKey], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const uid = request.auth.uid
  const { emailId } = request.data
  if (!emailId) throw new HttpsError('invalid-argument', 'emailId is required')

  const docSnap = await db.doc(`users/${uid}/emails/${emailId}`).get()
  if (!docSnap.exists) throw new HttpsError('not-found', 'Email not found')

  const email = docSnap.data()
  const apiKey = anthropicKey.value()

  const from = email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email
  const prompt = `You are drafting a reply on behalf of the founder of BeerBozo — an Australian app that shows the cheapest drink prices at pubs and bars.

Write a professional, concise reply to this email. Be friendly and on-brand. Do not use phrases like "I hope this email finds you well."

Original email:
From: ${from}
Subject: ${email.subject}
Body: ${(email.full_body || email.snippet || '').slice(0, 1500)}

Return ONLY the reply text (no subject line, no metadata).`

  const draft = await callClaude(apiKey, {
    maxTokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  return { draft }
})

exports.chat = onCall({ secrets: [anthropicKey], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const uid = request.auth.uid
  const { personaId, content } = request.data

  const VALID = ['alex', 'mia', 'sam', 'jordan']
  if (!VALID.includes(personaId)) throw new HttpsError('invalid-argument', 'Invalid persona')
  if (!content?.trim()) throw new HttpsError('invalid-argument', 'content is required')

  const messagesRef = db.collection(`users/${uid}/chatMessages`)

  // Save user message
  await messagesRef.add({
    persona_id: personaId,
    role: 'user',
    content: content.trim(),
    created_at: new Date().toISOString(),
  })

  // Fetch last 20 messages for context
  const historySnap = await messagesRef
    .where('persona_id', '==', personaId)
    .orderBy('created_at', 'desc')
    .limit(20)
    .get()

  const history = historySnap.docs
    .map(d => d.data())
    .reverse()
    .map(m => ({ role: m.role, content: m.content }))

  const apiKey = anthropicKey.value()
  const system = PERSONA_PROMPTS[personaId]
  const reply = await callClaude(apiKey, { system, maxTokens: 1024, messages: history })

  // Save assistant response
  await messagesRef.add({
    persona_id: personaId,
    role: 'assistant',
    content: reply,
    created_at: new Date().toISOString(),
  })

  return { reply }
})

exports.assessEmailStage = onCall({ secrets: [anthropicKey], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const uid = request.auth.uid
  const { emailId, category } = request.data
  if (!emailId || !category) throw new HttpsError('invalid-argument', 'emailId and category are required')

  const docSnap = await db.doc(`users/${uid}/emails/${emailId}`).get()
  if (!docSnap.exists) throw new HttpsError('not-found', 'Email not found')

  const email = docSnap.data()
  const apiKey = anthropicKey.value()
  const stages = WORKFLOW_STAGES[category] || WORKFLOW_STAGES.advertiser

  const prompt = `You are analysing an email for BeerBozo CRM — an Australian app for cheapest drink prices.

Based on this email content, determine which stage of the ${category} workflow this thread is currently at.

Workflow stages:
${stages.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Email:
From: ${email.from_name || email.from_email}
Subject: ${email.subject}
Content: ${(email.full_body || email.snippet || '').slice(0, 1500)}

Return ONLY a JSON object with no other text:
{"stageIndex": 0, "reasoning": "brief reason (max 15 words)"}

stageIndex is 0-based. Pick the most likely current stage.`

  try {
    const text = await callClaude(apiKey, {
      maxTokens: 128,
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = JSON.parse(text)
    const stageIndex = Math.min(Math.max(0, parsed.stageIndex || 0), stages.length - 1)
    return { stageIndex, stageName: stages[stageIndex], reasoning: parsed.reasoning || '' }
  } catch {
    return { stageIndex: 0, stageName: stages[0], reasoning: '' }
  }
})

exports.recategorizeEmails = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const uid = request.auth.uid

  const emailsRef = db.collection(`users/${uid}/emails`)
  const snapshot = await emailsRef.get()
  if (snapshot.empty) return { updated: 0 }

  // Re-run rules on every email and update category + needs_review
  const batchWrite = db.batch()
  let updated = 0

  for (const docSnap of snapshot.docs) {
    const email = docSnap.data()
    const { category, needsReview } = ruleBasedCategory(email.from_email, email.subject)
    if (category !== email.category || needsReview !== email.needs_review) {
      batchWrite.update(docSnap.ref, { category, needs_review: needsReview })
      updated++
    }
  }

  if (updated > 0) await batchWrite.commit()
  return { updated }
})

exports.suggestNextAction = onCall({ secrets: [anthropicKey], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const { clientName, stage, notes, recentEmailSnippets } = request.data
  if (!clientName) throw new HttpsError('invalid-argument', 'clientName is required')

  const apiKey = anthropicKey.value()

  const prompt = `You are a business advisor for BeerBozo — an Australian app showing cheapest drink prices at pubs and bars.

Suggest the single most important next action for this advertiser/partner relationship.

Client: ${clientName}
Pipeline stage: ${stage || 'Unknown'}
Notes: ${notes || 'None'}
Recent email context: ${(recentEmailSnippets || []).join('\n').slice(0, 800) || 'None'}

Return ONLY a short action sentence (max 20 words). No preamble, no explanation.`

  const suggestion = await callClaude(apiKey, {
    maxTokens: 64,
    messages: [{ role: 'user', content: prompt }],
  })

  return { suggestion: suggestion.trim() }
})

exports.suggestTaskStages = onCall({ secrets: [anthropicKey], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const { taskName, description } = request.data
  if (!taskName) throw new HttpsError('invalid-argument', 'taskName is required')

  const apiKey = anthropicKey.value()

  const prompt = `You are helping organise work for BeerBozo — an Australian app showing cheapest drink prices at pubs and bars.

Suggest 3-7 actionable stages for the task below. Use the title AND description together to understand exactly what needs to happen, and tailor the stages to the specific work involved — not generic steps like "Research, Draft, Done".

Task: ${taskName}
Description: ${description || '(no description provided)'}

Return ONLY a JSON array of short stage name strings (max 5 words each). No preamble, no explanation. Example: ["Contact venue", "Get pricing info", "Upload to app", "QA check", "Live"]`

  try {
    const text = await callClaude(apiKey, {
      maxTokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    // Strip markdown code fences if Claude wraps the response
    const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const stages = JSON.parse(cleaned)
    if (!Array.isArray(stages)) throw new Error('Not an array')
    return { stages: stages.slice(0, 8) }
  } catch (err) {
    console.error('suggestTaskStages error:', err)
    return { stages: ['To Do', 'In Progress', 'Done'] }
  }
})

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------

class BufferApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function bufferGraphQL(accessToken, query, variables = {}) {
  const res = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new BufferApiError(`Buffer API error ${res.status}`, res.status)
  const data = await res.json()
  if (data.errors && !data.data) {
    throw new BufferApiError(data.errors[0]?.message || 'Buffer GraphQL error', 500)
  }
  return data
}

// Fetch the first org ID for this token
async function bufferOrgId(accessToken) {
  const data = await bufferGraphQL(accessToken, '{ account { organizations { id } } }')
  const orgs = data.data?.account?.organizations || []
  if (!orgs.length) throw new HttpsError('internal', 'No Buffer organisation found')
  return orgs[0].id
}

// ---------------------------------------------------------------------------
// getBufferStats
// Returns: [{ platform, name, connected, avatar }] for Instagram/TikTok/Facebook
// ---------------------------------------------------------------------------

exports.getBufferStats = onCall({ secrets: [bufferAccessToken], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const token = bufferAccessToken.value()

  try {
    const orgId = await bufferOrgId(token)
    const data  = await bufferGraphQL(token, `
      { channels(input: { organizationId: "${orgId}" }) { id service name avatar } }
    `)
    const channels = data.data?.channels || []
    const TARGET   = ['instagram', 'tiktok', 'facebook']

    return TARGET.map(platform => {
      const ch = channels.find(c => c.service?.toLowerCase() === platform)
      return {
        platform,
        name:      ch?.name   || null,
        avatar:    ch?.avatar || null,
        connected: !!ch,
      }
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    throw new HttpsError('internal', err.message || 'Failed to fetch Buffer stats')
  }
})

// ---------------------------------------------------------------------------
// scheduleBufferPost
// Accepts: { caption, platforms[], scheduledAt }
// Returns: { success: true, postIds: [] }
// ---------------------------------------------------------------------------

exports.scheduleBufferPost = onCall({ secrets: [bufferAccessToken], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const { caption, platforms, scheduledAt } = request.data
  if (!caption || !platforms?.length || !scheduledAt) {
    throw new HttpsError('invalid-argument', 'caption, platforms, and scheduledAt are required')
  }

  const token = bufferAccessToken.value()
  const orgId = await bufferOrgId(token)

  const chData   = await bufferGraphQL(token, `
    { channels(input: { organizationId: "${orgId}" }) { id service } }
  `)
  const channels = chData.data?.channels || []
  const postIds  = []

  for (const platform of platforms) {
    const ch = channels.find(c => c.service?.toLowerCase() === platform.toLowerCase())
    if (!ch) continue
    try {
      const result = await bufferGraphQL(token,
        `mutation CreatePost($input: CreatePostInput!) {
           createPost(input: $input) { post { id status } }
         }`,
        { input: { channelId: ch.id, text: caption, scheduledAt } }
      )
      const postId = result.data?.createPost?.post?.id
      if (postId) postIds.push(postId)
    } catch (err) {
      console.error(`scheduleBufferPost failed for ${platform}:`, err.message)
    }
  }

  return { success: true, postIds }
})

// ---------------------------------------------------------------------------
// getScheduledPosts
// Returns: [{ id, text, scheduledAt, platform, status }]
// ---------------------------------------------------------------------------

exports.getScheduledPosts = onCall({ secrets: [bufferAccessToken], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const token = bufferAccessToken.value()

  try {
    const orgId = await bufferOrgId(token)
    const data  = await bufferGraphQL(token, `
      { posts(input: { organizationId: "${orgId}", status: scheduled }) {
          edges { node { id text scheduledAt channel { service } status } }
        }
      }
    `)
    const edges = data.data?.posts?.edges || []
    return edges.map(({ node }) => ({
      id:          node.id,
      text:        node.text,
      scheduledAt: node.scheduledAt,
      platform:    node.channel?.service || null,
      status:      node.status,
    }))
  } catch (err) {
    if (err instanceof HttpsError) throw err
    throw new HttpsError('internal', err.message || 'Failed to fetch scheduled posts')
  }
})

// ---------------------------------------------------------------------------
// getBufferAnalytics
// Returns: { totalPosts, platformBreakdown }
//   OR:    { error: 'upgrade_required' } on 403
// ---------------------------------------------------------------------------

exports.getBufferAnalytics = onCall({ secrets: [bufferAccessToken], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const token = bufferAccessToken.value()

  try {
    const orgId = await bufferOrgId(token)
    const data  = await bufferGraphQL(token, `
      { posts(input: { organizationId: "${orgId}", status: sent, first: 100 }) {
          edges { node { id text } }
        }
      }
    `)
    const posts     = (data.data?.posts?.edges || []).map(e => e.node)
    const totalPosts = posts.length
    const bestPost   = posts[0] ? { text: posts[0].text } : null

    return { totalPosts, bestPost, platformBreakdown: {} }
  } catch (err) {
    if (err instanceof BufferApiError && err.status === 403) return { error: 'upgrade_required' }
    if (err instanceof HttpsError) throw err
    return { error: 'upgrade_required' }
  }
})

// ---------------------------------------------------------------------------
// generateSocialCaption
// Accepts: { topic, platforms[] }
// Returns: { caption }
// ---------------------------------------------------------------------------

exports.generateSocialCaption = onCall({ secrets: [anthropicKey], cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')
  const { topic, platforms } = request.data
  if (!topic?.trim()) throw new HttpsError('invalid-argument', 'topic is required')

  const apiKey = anthropicKey.value()
  const platformList = platforms?.length ? platforms.join(', ') : 'Instagram, TikTok, Facebook'

  const prompt = `You are writing a social media post for BeerBozo — an Australian app that shows cheapest drink prices at pubs and bars. The handle is @beerbozo.com.au.

Topic: ${topic}
Platforms: ${platformList}

Write an engaging, on-brand caption. Include relevant emojis, a clear call to action, and appropriate hashtags at the end. Keep it concise and punchy — max 3 short paragraphs. Use an Australian tone that is fun and relatable.

Return ONLY the caption text, no preamble or explanation.`

  const caption = await callClaude(apiKey, {
    maxTokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  return { caption }
})
