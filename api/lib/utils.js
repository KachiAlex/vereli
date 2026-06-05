export function sendJson(res, status, data) {
  res.status(status).json(data);
}

export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function badRequest(res, message = 'Bad request') {
  sendJson(res, 400, { error: message });
}

export function notFound(res, message = 'Not found') {
  sendJson(res, 404, { error: message });
}

export async function requireAuth(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
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
