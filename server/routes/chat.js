const express = require('express')
const router = express.Router()
const requireAuth = require('../middleware/auth')
const { chatWithPersona } = require('../utils/anthropic')
const db = require('../utils/db')

const VALID_PERSONAS = ['alex', 'mia', 'sam', 'jordan']

// GET /api/chat/:personaId — get conversation history
router.get('/:personaId', requireAuth, async (req, res) => {
  const { personaId } = req.params

  if (!VALID_PERSONAS.includes(personaId)) {
    return res.status(400).json({ error: 'Invalid persona' })
  }

  try {
    const messages = await db.getChatMessages(personaId)
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/chat/:personaId — send a message, get AI reply
router.post('/:personaId', requireAuth, async (req, res) => {
  const { personaId } = req.params
  const { content } = req.body

  if (!VALID_PERSONAS.includes(personaId)) {
    return res.status(400).json({ error: 'Invalid persona' })
  }
  if (!content?.trim()) {
    return res.status(400).json({ error: 'content is required' })
  }

  try {
    // Save user message
    await db.createChatMessage({ persona_id: personaId, role: 'user', content })

    // Build message history for context (last 20 messages)
    const history = await db.getChatMessages(personaId)
    const contextMessages = history.slice(-20).map((m) => ({ role: m.role, content: m.content }))

    // Get AI reply
    const reply = await chatWithPersona(personaId, contextMessages)

    // Save assistant reply
    await db.createChatMessage({ persona_id: personaId, role: 'assistant', content: reply })

    res.json({ reply })
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/chat/:personaId — not implemented (kept for future use)

module.exports = router
