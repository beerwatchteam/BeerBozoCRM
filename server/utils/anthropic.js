const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

const CATEGORIES = ['collab', 'investor', 'advertiser', 'platform', 'outreach']

async function categorizeAndSummarize(email) {
  const { from, subject, snippet, body } = email
  const content = body || snippet || ''

  const prompt = `You are an AI assistant for BeerBozo — an Australian app that shows the cheapest drink prices at pubs and bars.

Analyse this email and return a JSON object with exactly these two fields:
- "category": one of ${CATEGORIES.join(', ')} (collab = collaboration/partnership offer, investor = investment interest, advertiser = wanting to advertise, platform = tech/platform related, outreach = general/cold/other)
- "summary": 1-2 sentences describing what the email is about and what action (if any) is needed

Email:
From: ${from}
Subject: ${subject}
Body: ${content.slice(0, 1000)}

Return ONLY valid JSON, no other text.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].text.trim()

  try {
    const parsed = JSON.parse(text)
    return {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'outreach',
      summary: parsed.summary || '',
    }
  } catch {
    return { category: 'outreach', summary: '' }
  }
}

async function draftReply(email, context = '') {
  const { from, subject, body } = email

  const prompt = `You are drafting a reply on behalf of the founder of BeerBozo — an Australian app that shows the cheapest drink prices at pubs and bars.

Write a professional, concise reply to this email. Be friendly and on-brand. Do not use phrases like "I hope this email finds you well."

Original email:
From: ${from}
Subject: ${subject}
Body: ${(body || '').slice(0, 1500)}

${context ? `Additional context: ${context}` : ''}

Return ONLY the email reply text (no subject line, no metadata).`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].text.trim()
}

const PERSONA_PROMPTS = {
  alex: `You are Alex, the CEO of BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You are a strategic advisor to the founder. Focus on growth strategy, fundraising, key partnerships, and high-level decisions. You are direct, commercially minded, and cut through the noise. Give concise, actionable advice.`,

  mia: `You are Mia, Head of Marketing at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle social media, content strategy, influencer collaborations, and user acquisition. You are creative, practical, and know what works for indie apps on a budget. Give grounded, actionable marketing advice.`,

  sam: `You are Sam, Head of Design at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle UI/UX, brand identity, and all visual design decisions. You think visually, prioritise usability, and understand the constraints of a small team. Give practical design advice.`,

  jordan: `You are Jordan, Head of Commercial at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle advertiser partnerships, pub and bar onboarding, revenue streams, and investor relations. You are sharp, commercially focused, and always thinking about the business model. Give direct commercial advice.`,
}

async function chatWithPersona(personaId, messages) {
  const systemPrompt = PERSONA_PROMPTS[personaId]
  if (!systemPrompt) throw new Error(`Unknown persona: ${personaId}`)

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })

  return message.content[0].text.trim()
}

module.exports = { categorizeAndSummarize, draftReply, chatWithPersona }
