const express = require('express')
const router = express.Router()
const { google } = require('googleapis')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { getOAuth2Client } = require('../utils/gmail')
const tokenStore = require('../utils/tokenStore')
const requireAuth = require('../middleware/auth')

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
]

// Step 1: redirect to Google
router.get('/google', (req, res) => {
  const auth = getOAuth2Client()
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
  res.redirect(url)
})

// Step 2: Google redirects back here
router.get('/callback', async (req, res) => {
  const { code, error } = req.query

  if (error) {
    return res.redirect(`${process.env.CLIENT_URL}?error=${error}`)
  }
  if (!code) {
    return res.redirect(`${process.env.CLIENT_URL}?error=no_code`)
  }

  try {
    const auth = getOAuth2Client()
    const { tokens } = await auth.getToken(code)
    auth.setCredentials(tokens)

    // Fetch user profile
    const oauth2 = google.oauth2({ version: 'v2', auth })
    const { data: profile } = await oauth2.userinfo.get()

    // Store tokens server-side
    const sessionId = uuidv4()
    tokenStore.set(sessionId, tokens)

    // Issue JWT
    const jwtPayload = {
      sub: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      sessionId,
    }

    const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '7d' })

    // Redirect frontend with token
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.redirect(`${process.env.CLIENT_URL}?error=auth_failed`)
  }
})

// Get current user
router.get('/me', requireAuth, (req, res) => {
  res.json({
    sub: req.user.sub,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture,
  })
})

// Logout
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET)
      tokenStore.delete(decoded.sessionId)
    } catch {}
  }
  res.json({ success: true })
})

module.exports = router
