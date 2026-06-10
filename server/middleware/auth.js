const jwt = require('jsonwebtoken')
const tokenStore = require('../utils/tokenStore')
const { getAuthenticatedClient } = require('../utils/gmail')

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded

    const tokens = tokenStore.get(decoded.sessionId)
    if (!tokens) {
      return res.status(401).json({ error: 'Session expired — please log in again' })
    }

    req.googleTokens = tokens
    req.gmailAuth = getAuthenticatedClient(tokens)
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = requireAuth
