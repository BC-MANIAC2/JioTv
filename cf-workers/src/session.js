// ============================================================
// Session Management — Cookie-based sessions backed by KV
// ============================================================

const COOKIE_NAME = 'jiotv_sess';
const SESSION_TTL = 30 * 24 * 3600; // 30 days

import { encrypt, decrypt } from './crypto.js';

// Generate a cryptographically random session ID
function makeSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Extract session ID from Cookie header
function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-f0-9]{32})`));
  return match ? match[1] : null;
}

// Read session data from KV (returns decrypted JS object or null)
export async function getSession(request, env) {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;

  const raw = await env.KV.get(`sess_${sessionId}`);
  if (!raw) return null;

  const json = await decrypt(raw);
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Create a new session, return the session ID
export async function createSession(data, env) {
  const sessionId = makeSessionId();
  const encrypted = await encrypt(JSON.stringify(data));
  await env.KV.put(`sess_${sessionId}`, encrypted, { expirationTtl: SESSION_TTL });
  return sessionId;
}

// Update existing session data
export async function updateSession(request, data, env) {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;
  const encrypted = await encrypt(JSON.stringify(data));
  await env.KV.put(`sess_${sessionId}`, encrypted, { expirationTtl: SESSION_TTL });
  return sessionId;
}

// Delete session from KV
export async function deleteSession(request, env) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.KV.delete(`sess_${sessionId}`);
  }
}

// Build a Set-Cookie header value for a new session
export function buildSetCookie(sessionId, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${maxAge}`;
}

// Build a Set-Cookie header that clears the session
export function buildClearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
