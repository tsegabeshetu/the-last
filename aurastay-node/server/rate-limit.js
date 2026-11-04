import { tooMany } from './http-error.js';

const buckets = new Map();

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
    .split(',')[0]
    .trim() || req.socket.remoteAddress || 'unknown';
  return ip;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();

/**
 * Small in-memory fixed-window rate limiter. Good enough for a single-process
 * demo; use a shared store (Redis) when running more than one instance.
 */
export function rateLimit({ windowMs = 60_000, max = 30, scope = 'default' } = {}) {
  return (req, _res, next) => {
    const key = `${scope}:${clientKey(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return next(tooMany());
    }
    next();
  };
}
