import crypto from 'node:crypto';
import { config } from './env.js';
import { getDb, saveDb } from './store.js';

export { hashPassword, verifyPassword } from './password.js';

export const SESSION_COOKIE = 'aurastay_session';

export function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.sessions[token] = {
    userId,
    createdAt: now,
    expiresAt: now + config.sessionTtlDays * 24 * 60 * 60 * 1000,
  };
  pruneSessions(db);
  saveDb();
  return token;
}

export function destroySession(token) {
  if (!token) return;
  const db = getDb();
  if (db.sessions[token]) {
    delete db.sessions[token];
    saveDb();
  }
}

export function findSession(token) {
  if (!token) return null;
  const db = getDb();
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    delete db.sessions[token];
    saveDb();
    return null;
  }
  return session;
}

export function pruneSessions(db = getDb()) {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of Object.entries(db.sessions)) {
    if (!session || session.expiresAt <= now) {
      delete db.sessions[token];
      changed = true;
    }
  }
  return changed;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
  };
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[key] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

export function serializeCookie(name, value, { maxAge, expires } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (config.isProduction) parts.push('Secure');
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  if (expires) parts.push(`Expires=${expires.toUTCString()}`);
  return parts.join('; ');
}

export function setSessionCookie(res, token) {
  const maxAge = config.sessionTtlDays * 24 * 60 * 60 * 1000;
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge }));
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, '', { maxAge: 0, expires: new Date(0) }),
  );
}
