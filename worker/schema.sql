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
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  user_picture TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (email_id) REFERENCES emails(id)
);

CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_persona ON chat_messages(persona_id, created_at);
