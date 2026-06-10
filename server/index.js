require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

const authRouter = require('./routes/auth')
const emailsRouter = require('./routes/emails')
const aiRouter = require('./routes/ai')
const chatRouter = require('./routes/chat')

const app = express()
const PORT = process.env.PORT || 3001

// Trust proxy (Cloudflare, etc.)
app.set('trust proxy', 1)

// CORS — allow frontend origin
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))

// Body parsing
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

// Routes
app.use('/auth', authRouter)
app.use('/api/emails', emailsRouter)
app.use('/api/ai', aiRouter)
app.use('/api/chat', chatRouter)

// Health check
app.get('/health', (req, res) => res.json({ ok: true }))

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`BeerBozo CRM server running on http://localhost:${PORT}`)
})
