// JWT using Web Crypto API (no Node.js dependencies)

export async function signJWT(payload, secret, expiresInSeconds = 7 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000)
  const full = { ...payload, iat: now, exp: now + expiresInSeconds }

  const header = toBase64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = toBase64url(JSON.stringify(full))
  const input = `${header}.${body}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = bufToBase64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input)))
  return `${input}.${sig}`
}

export async function verifyJWT(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token')

  const [header, payload, sig] = parts
  const input = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const valid = await crypto.subtle.verify(
    'HMAC', key,
    base64urlToBuf(sig),
    new TextEncoder().encode(input)
  )
  if (!valid) throw new Error('Invalid token signature')

  const decoded = JSON.parse(base64urlToStr(payload))
  if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  return decoded
}

function toBase64url(str) {
  return bufToBase64url(new TextEncoder().encode(str))
}

function bufToBase64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  bytes.forEach(b => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlToBuf(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  return new Uint8Array([...atob(padded)].map(c => c.charCodeAt(0)))
}

function base64urlToStr(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  // Proper UTF-8 decode via TextDecoder
  const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)))
  return new TextDecoder().decode(bytes)
}
