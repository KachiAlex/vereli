export function sendJson(res, status, data) {
  res.status(status).json(data);
}

export function handleCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function parseCookie(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [decodeURIComponent(k), decodeURIComponent(v.join('='))];
  }).filter(([k]) => k));
}

export function setCookie(res, name, value, maxAge) {
  const cookie = `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
  const existing = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
}

export function clearCookie(res, name) {
  const cookie = `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  const existing = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
}

export function badRequest(res, message = 'Bad request') {
  sendJson(res, 400, { error: message });
}

export function notFound(res, message = 'Not found') {
  sendJson(res, 404, { error: message });
}

export async function requireAuth(req, res) {
  // Check for token in cookies first
  const cookies = parseCookie(req);
  let token = cookies.access_token;
  
  // Fallback: check Authorization header (Bearer token)
  if (!token) {
    const auth = req.headers.authorization || '';
    token = auth.replace('Bearer ', '');
  }
  
  if (!token) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  try {
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });
    req.user = payload;
    return payload;
  } catch {
    sendJson(res, 401, { error: 'Invalid or expired token' });
    return null;
  }
}
