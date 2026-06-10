// In-memory store for Google OAuth tokens keyed by sessionId.
// Acceptable for single-user; swap for Redis/D1 for multi-instance production.
const tokenStore = new Map()

module.exports = tokenStore
