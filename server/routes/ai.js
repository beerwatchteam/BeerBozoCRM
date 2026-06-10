const express = require('express')
const router = express.Router()
const requireAuth = require('../middleware/auth')
const { draftReply } = require('../utils/anthropic')
const db = require('../utils/db')

// POST /api/ai/draft-reply
router.post('/draft-reply', requireAuth, async (req, res) => {
  try {
    const { emailId } = req.body

    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' })
    }

    const email = await db.getEmail(emailId)
    if (!email) {
      return res.status(404).json({ error: 'Email not found' })
    }

    const draft = await draftReply({
      from: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
      subject: email.subject,
      body: email.full_body || email.snippet,
    })

    res.json({ draft })
  } catch (err) {
    console.error('Draft reply error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
