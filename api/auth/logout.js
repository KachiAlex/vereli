import { sendJson, handleCors, clearCookie } from '../lib/utils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  clearCookie(res, 'access_token');
  clearCookie(res, 'refresh_token');
  sendJson(res, 200, { data: { message: 'Logged out' } });
}
