const MODEL = 'claude-sonnet-4-20250514'
const CATEGORIES = ['collab', 'investor', 'advertiser', 'platform', 'outreach']

async function callClaude(apiKey, { system, messages, maxTokens = 512 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Anthropic error ${res.status}: ${err?.error?.message || res.statusText}`)
  }

  const data = await res.json()
  return data.content[0].text.trim()
}

export async function categorizeAndSummarize(apiKey, { from, subject, snippet, body }) {
  const content = body || snippet || ''

  const prompt = `You are an AI assistant for BeerBozo — an Australian app that shows cheapest drink prices at pubs and bars.

Analyse this email and return a JSON object with exactly these two fields:
- "category": one of ${CATEGORIES.join(', ')} (collab=collaboration/partnership, investor=investment interest, advertiser=wanting to advertise, platform=tech/platform related, outreach=general/cold/other)
- "summary": 1-2 sentences — what is it about and what action is needed

Email:
From: ${from}
Subject: ${subject}
Body: ${content.slice(0, 1000)}

Return ONLY valid JSON, no other text.`

  try {
    const text = await callClaude(apiKey, {
      maxTokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = JSON.parse(text)
    return {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'outreach',
      summary: parsed.summary || '',
    }
  } catch {
    return { category: 'outreach', summary: '' }
  }
}

export async function draftReply(apiKey, { from, subject, body }) {
  const prompt = `You are drafting a reply on behalf of the founder of BeerBozo — an Australian app that shows the cheapest drink prices at pubs and bars.

Write a professional, concise reply to this email. Be friendly and on-brand. Do not use phrases like "I hope this email finds you well."

Original email:
From: ${from}
Subject: ${subject}
Body: ${(body || '').slice(0, 1500)}

Return ONLY the reply text (no subject line, no metadata).`

  return callClaude(apiKey, {
    maxTokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
}

const PERSONA_PROMPTS = {
  alex: 'You are Alex, CEO of BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You are a strategic advisor to the founder. Focus on growth strategy, fundraising, key partnerships, and high-level decisions. Be direct, commercially minded, and cut through the noise.',
  mia: 'You are Mia, Head of Marketing at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle social media, content strategy, influencer collabs, and user acquisition. Be creative, practical, and grounded in what works for indie apps.',
  sam: 'You are Sam, Head of Design at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle UI/UX, brand identity, and visual design. Think visually, prioritise usability, and work within the constraints of a small team.',
  jordan: 'You are Jordan, Head of Commercial at BeerBozo — an Australian app that helps users find the cheapest drink prices across pubs and bars. You handle advertiser partnerships, pub/bar onboarding, revenue streams, and investor relations. Be sharp and commercially focused.',
}

export async function chatWithPersona(apiKey, personaId, messages) {
  const system = PERSONA_PROMPTS[personaId]
  if (!system) throw new Error(`Unknown persona: ${personaId}`)

  return callClaude(apiKey, {
    system,
    maxTokens: 1024,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })
}
