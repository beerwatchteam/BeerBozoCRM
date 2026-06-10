// All D1 database operations

export async function getEmails(db, { limit = 100, offset = 0, category } = {}) {
  let q = 'SELECT * FROM emails'
  const params = []
  if (category && category !== 'all') {
    q += ' WHERE category = ?'
    params.push(category)
  }
  q += ' ORDER BY date DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)
  const r = await db.prepare(q).bind(...params).all()
  return r.results
}

export async function getEmail(db, id) {
  return db.prepare('SELECT * FROM emails WHERE id = ? OR gmail_id = ?').bind(id, id).first()
}

export async function createEmail(db, email) {
  const {
    gmail_id, from_email, from_name, subject, snippet,
    full_body, date, category = 'outreach', is_read = 0, ai_summary,
  } = email
  await db.prepare(`
    INSERT OR IGNORE INTO emails
      (id, gmail_id, from_email, from_name, subject, snippet, full_body, date, category, is_read, ai_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    gmail_id, gmail_id, from_email, from_name ?? null, subject ?? null,
    snippet ?? null, full_body ?? null, date, category, is_read ? 1 : 0, ai_summary ?? null
  ).run()
  return gmail_id
}

export async function batchCreateEmails(db, emails) {
  let inserted = 0
  for (const email of emails) {
    const {
      gmail_id, from_email, from_name, subject, snippet,
      full_body, date, category = 'outreach', is_read = 0, ai_summary,
    } = email
    const r = await db.prepare(`
      INSERT OR IGNORE INTO emails
        (id, gmail_id, from_email, from_name, subject, snippet, full_body, date, category, is_read, ai_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      gmail_id, gmail_id, from_email, from_name ?? null, subject ?? null,
      snippet ?? null, full_body ?? null, date, category, is_read ? 1 : 0, ai_summary ?? null
    ).run()
    if (r.meta.changes > 0) inserted++
  }
  return inserted
}

export async function updateEmail(db, id, updates) {
  const cols = []
  const vals = []
  if (updates.category !== undefined) { cols.push('category = ?'); vals.push(updates.category) }
  if (updates.is_read !== undefined) { cols.push('is_read = ?'); vals.push(updates.is_read ? 1 : 0) }
  if (updates.ai_summary !== undefined) { cols.push('ai_summary = ?'); vals.push(updates.ai_summary) }
  if (updates.full_body !== undefined) { cols.push('full_body = ?'); vals.push(updates.full_body) }
  if (!cols.length) return
  vals.push(id)
  await db.prepare(`UPDATE emails SET ${cols.join(', ')} WHERE id = ?`).bind(...vals).run()
}

export async function getStats(db) {
  const [total, unread, collab, commercial] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM emails').first(),
    db.prepare('SELECT COUNT(*) as c FROM emails WHERE is_read = 0').first(),
    db.prepare("SELECT COUNT(*) as c FROM emails WHERE category = 'collab'").first(),
    db.prepare("SELECT COUNT(*) as c FROM emails WHERE category IN ('investor','advertiser')").first(),
  ])
  return { total: total.c, unread: unread.c, collab: collab.c, commercial: commercial.c }
}

export async function getChatMessages(db, personaId) {
  const r = await db.prepare(
    'SELECT * FROM chat_messages WHERE persona_id = ? ORDER BY created_at ASC'
  ).bind(personaId).all()
  return r.results
}

export async function createChatMessage(db, { persona_id, role, content }) {
  const r = await db.prepare(
    'INSERT INTO chat_messages (persona_id, role, content) VALUES (?, ?, ?)'
  ).bind(persona_id, role, content).run()
  return r.meta.last_row_id
}

// Sessions (replaces in-memory token store from Express)
export async function createSession(db, { session_id, user_id, user_email, user_name, user_picture, access_token, refresh_token, expiry_date }) {
  await db.prepare(`
    INSERT OR REPLACE INTO sessions
      (session_id, user_id, user_email, user_name, user_picture, access_token, refresh_token, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(session_id, user_id, user_email, user_name ?? null, user_picture ?? null, access_token, refresh_token ?? null, expiry_date ?? null).run()
}

export async function getSession(db, sessionId) {
  return db.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first()
}

export async function updateSessionToken(db, sessionId, accessToken, expiryDate) {
  await db.prepare(
    'UPDATE sessions SET access_token = ?, expiry_date = ? WHERE session_id = ?'
  ).bind(accessToken, expiryDate, sessionId).run()
}

export async function deleteSession(db, sessionId) {
  await db.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run()
}
