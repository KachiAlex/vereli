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
