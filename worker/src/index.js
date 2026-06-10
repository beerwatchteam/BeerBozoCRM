export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret',
    }

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Auth check
    const secret = request.headers.get('X-Worker-Secret')
    if (secret !== env.WORKER_SECRET) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders)
    }

    try {
      // Emails
      if (path === '/emails' && method === 'GET') return handleGetEmails(url, env, corsHeaders)
      if (path === '/emails' && method === 'POST') return handleCreateEmail(request, env, corsHeaders)
      if (path === '/emails/batch' && method === 'POST') return handleBatchCreateEmails(request, env, corsHeaders)

      const emailMatch = path.match(/^\/emails\/([^/]+)$/)
      if (emailMatch && method === 'GET') return handleGetEmail(emailMatch[1], env, corsHeaders)
      if (emailMatch && method === 'PUT') return handleUpdateEmail(request, emailMatch[1], env, corsHeaders)

      // Chat messages
      const chatMatch = path.match(/^\/chat-messages\/([^/]+)$/)
      if (chatMatch && method === 'GET') return handleGetChatMessages(chatMatch[1], env, corsHeaders)
      if (path === '/chat-messages' && method === 'POST') return handleCreateChatMessage(request, env, corsHeaders)

      // Stats
      if (path === '/stats' && method === 'GET') return handleGetStats(env, corsHeaders)

      // DB init (run once after deploy)
      if (path === '/init' && method === 'POST') return handleInit(env, corsHeaders)

      return json({ error: 'Not found' }, 404, corsHeaders)
    } catch (err) {
      console.error(err)
      return json({ error: err.message }, 500, corsHeaders)
    }
  },
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

async function handleGetEmails(url, env, headers) {
  const limit = parseInt(url.searchParams.get('limit') || '100')
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const category = url.searchParams.get('category')

  let query = 'SELECT * FROM emails'
  const params = []

  if (category && category !== 'all') {
    query += ' WHERE category = ?'
    params.push(category)
  }

  query += ' ORDER BY date DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const result = await env.DB.prepare(query).bind(...params).all()
  return json(result.results, 200, headers)
}

async function handleGetEmail(id, env, headers) {
  const result = await env.DB.prepare(
    'SELECT * FROM emails WHERE id = ? OR gmail_id = ?'
  ).bind(id, id).first()

  if (!result) return json({ error: 'Not found' }, 404, headers)
  return json(result, 200, headers)
}

async function handleCreateEmail(request, env, headers) {
  const body = await request.json()
  const {
    gmail_id, from_email, from_name, subject, snippet,
    full_body, date, category = 'outreach', is_read = 0, ai_summary,
  } = body

  await env.DB.prepare(`
    INSERT OR IGNORE INTO emails
      (id, gmail_id, from_email, from_name, subject, snippet, full_body, date, category, is_read, ai_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(gmail_id, gmail_id, from_email, from_name ?? null, subject ?? null,
    snippet ?? null, full_body ?? null, date, category, is_read ? 1 : 0, ai_summary ?? null).run()

  return json({ id: gmail_id, success: true }, 201, headers)
}

async function handleBatchCreateEmails(request, env, headers) {
  const emails = await request.json()
  let inserted = 0

  for (const email of emails) {
    const {
      gmail_id, from_email, from_name, subject, snippet,
      full_body, date, category = 'outreach', is_read = 0, ai_summary,
    } = email

    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO emails
        (id, gmail_id, from_email, from_name, subject, snippet, full_body, date, category, is_read, ai_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(gmail_id, gmail_id, from_email, from_name ?? null, subject ?? null,
      snippet ?? null, full_body ?? null, date, category, is_read ? 1 : 0, ai_summary ?? null).run()

    if (result.meta.changes > 0) inserted++
  }

  return json({ inserted, success: true }, 200, headers)
}

async function handleUpdateEmail(request, id, env, headers) {
  const body = await request.json()
  const updates = []
  const values = []

  if (body.category !== undefined) { updates.push('category = ?'); values.push(body.category) }
  if (body.is_read !== undefined) { updates.push('is_read = ?'); values.push(body.is_read ? 1 : 0) }
  if (body.ai_summary !== undefined) { updates.push('ai_summary = ?'); values.push(body.ai_summary) }
  if (body.full_body !== undefined) { updates.push('full_body = ?'); values.push(body.full_body) }

  if (updates.length === 0) return json({ success: true }, 200, headers)

  values.push(id)
  await env.DB.prepare(`UPDATE emails SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run()

  return json({ success: true }, 200, headers)
}

async function handleGetChatMessages(personaId, env, headers) {
  const result = await env.DB.prepare(
    'SELECT * FROM chat_messages WHERE persona_id = ? ORDER BY created_at ASC'
  ).bind(personaId).all()

  return json(result.results, 200, headers)
}

async function handleCreateChatMessage(request, env, headers) {
  const { persona_id, role, content } = await request.json()

  const result = await env.DB.prepare(
    'INSERT INTO chat_messages (persona_id, role, content) VALUES (?, ?, ?)'
  ).bind(persona_id, role, content).run()

  return json({ id: result.meta.last_row_id, success: true }, 201, headers)
}

async function handleGetStats(env, headers) {
  const [total, unread, collab, commercial] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM emails').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM emails WHERE is_read = 0').first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM emails WHERE category = 'collab'").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM emails WHERE category IN ('investor', 'advertiser')").first(),
  ])

  return json({
    total: total.count,
    unread: unread.count,
    collab: collab.count,
    commercial: commercial.count,
  }, 200, headers)
}

async function handleInit(env, headers) {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      gmail_id TEXT UNIQUE NOT NULL,
      from_email TEXT NOT NULL,
      from_name TEXT,
      subject TEXT,
      snippet TEXT,
      full_body TEXT,
      date TEXT NOT NULL,
      category TEXT DEFAULT 'outreach',
      is_read INTEGER DEFAULT 0,
      ai_summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id TEXT,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  return json({ success: true, message: 'Database initialised' }, 200, headers)
}
