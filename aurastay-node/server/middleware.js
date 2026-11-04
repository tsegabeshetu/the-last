import { getDb } from './store.js';
import { parseCookies, SESSION_COOKIE, findSession, publicUser } from './auth.js';
import { forbidden, unauthorized } from './http-error.js';

/** Attach req.user and req.sessionToken when a valid session cookie exists. */
export function attachUser(req, _res, next) {
  req.user = null;
  req.sessionToken = null;
  try {
    const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
    if (!token) return next();
    const session = findSession(token);
    if (!session) return next();
    const db = getDb();
    const user = db.users.find((candidate) => candidate.id === session.userId);
    if (!user) return next();
    req.user = user;
    req.sessionToken = token;
  } catch {
    req.user = null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireStaff = requireRole('admin', 'member');

export function currentUser(req) {
  return publicUser(req.user);
}

/** Reject cross-site state-changing requests when an Origin header is present. */
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let expected;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    expected = `${protocol}://${host}`;
  } catch {
    expected = null;
  }
  if (!expected || origin !== expected) {
    return res.status(403).json({ error: { message: 'Cross-site request blocked.' } });
  }
  next();
}
