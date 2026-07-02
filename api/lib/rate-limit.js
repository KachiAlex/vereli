const store = new Map();

export function checkRateLimit(req, { windowMs = 60000, maxRequests = 10 }) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const key = `${ip}:${req.url}`;
  const now = Date.now();

  const record = store.get(key);
  if (!record) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (now > record.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  record.count++;
  return record.count > maxRequests;
}
