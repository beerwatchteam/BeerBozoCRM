const express = require('express')
const router = express.Router()
const requireAuth = require('../middleware/auth')
const { listMessages, getMessage, sendEmail, markAsRead, extractHeader, extractBody } = require('../utils/gmail')
const { categorizeAndSummarize } = require('../utils/anthropic')
const db = require('../utils/db')

// GET /api/emails — fetch from DB (fast, pre-processed)
router.get('/', requireAuth, async (req, res) => {
  try {
    const emails = await db.getEmails({ limit: 100 })
    res.json(emails)
  } catch (err) {
    console.error('Get emails error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/emails/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await db.getStats()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/emails/sync — pull from Gmail, process with AI, store in DB
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const messages = await listMessages(req.gmailAuth, { maxResults: 50, query: 'in:inbox' })

    if (!messages.length) {
      return res.json({ synced: 0, message: 'No messages found' })
    }

    // Fetch metadata for all messages in parallel (batches of 10 to avoid rate limits)
    const BATCH = 10
    const metaList = []

    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map((m) => getMessage(req.gmailAuth, m.id, 'metadata').catch(() => null))
      )
      metaList.push(...results.filter(Boolean))
    }

    // Check which ones are already in the DB
    const existingEmails = await db.getEmails({ limit: 200 })
    const existingIds = new Set(existingEmails.map((e) => e.gmail_id))

    const newMessages = metaList.filter((m) => !existingIds.has(m.id))

    if (!newMessages.length) {
      return res.json({ synced: 0, message: 'All messages already synced' })
    }

    // Process new messages with AI (batches of 5 to avoid rate limits)
    const AI_BATCH = 5
    const emailsToSave = []

    for (let i = 0; i < newMessages.length; i += AI_BATCH) {
      const batch = newMessages.slice(i, i + AI_BATCH)
      const processed = await Promise.all(
        batch.map(async (msg) => {
          const headers = msg.payload?.headers || []
          const from = extractHeader(headers, 'From')
          const subject = extractHeader(headers, 'Subject')
          const dateStr = extractHeader(headers, 'Date')
          const snippet = msg.snippet || ''
          const isUnread = (msg.labelIds || []).includes('UNREAD')

          // Parse from name and email
          const fromMatch = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/)
          const fromName = fromMatch ? fromMatch[1].trim() : ''
          const fromEmail = fromMatch ? (fromMatch[2].trim() || from) : from

          let category = 'outreach'
          let summary = ''

          try {
            const ai = await categorizeAndSummarize({ from, subject, snippet })
            category = ai.category
            summary = ai.summary
          } catch (aiErr) {
            console.error('AI processing error for', msg.id, aiErr.message)
          }

          return {
            gmail_id: msg.id,
            from_email: fromEmail,
            from_name: fromName,
            subject,
            snippet,
            full_body: null,
            date: dateStr || new Date().toISOString(),
            category,
            is_read: isUnread ? 0 : 1,
            ai_summary: summary,
          }
        })
      )
      emailsToSave.push(...processed)
    }

    await db.batchCreateEmails(emailsToSave)

    res.json({ synced: emailsToSave.length, message: `Synced ${emailsToSave.length} new emails` })
  } catch (err) {
    console.error('Sync error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/emails/:id/body — fetch full body from Gmail and cache in DB
router.get('/:id/body', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    // Check if we already have the body cached
    const cached = await db.getEmail(id)
    if (cached?.full_body) {
      // Mark as read
      await markAsRead(req.gmailAuth, id).catch(() => {})
      await db.updateEmail(id, { is_read: 1 })
      return res.json({ body: cached.full_body })
    }

    // Fetch full message from Gmail
    const msg = await getMessage(req.gmailAuth, id, 'full')
    const body = extractBody(msg.payload)

    // Cache in DB and mark as read
    await Promise.all([
      db.updateEmail(id, { full_body: body, is_read: 1 }),
      markAsRead(req.gmailAuth, id).catch(() => {}),
    ])

    res.json({ body })
  } catch (err) {
    console.error('Get body error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/emails/:id/reply — send a reply
router.post('/:id/reply', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { body, to, subject, threadId, inReplyTo, references } = req.body

    if (!body || !to) {
      return res.status(400).json({ error: 'Missing required fields: body, to' })
    }

    const result = await sendEmail(req.gmailAuth, { to, subject, body, threadId, inReplyTo, references })
    res.json({ success: true, messageId: result.id })
  } catch (err) {
    console.error('Reply error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/emails/compose — send a new email
router.post('/compose', requireAuth, async (req, res) => {
  try {
    const { to, subject, body } = req.body

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body' })
    }

    const result = await sendEmail(req.gmailAuth, { to, subject, body })
    res.json({ success: true, messageId: result.id })
  } catch (err) {
    console.error('Compose error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
