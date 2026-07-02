import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { generateTOTP } from './2fa-setup.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') { badRequest(res, 'Method not allowed'); return; }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { code, action } = req.body || {}; // action: 'setup' | 'login'
  if (!code || code.length !== 6) { badRequest(res, '6-digit code required'); return; }

  const [u] = await sql`SELECT totp_secret, totp_enabled FROM users WHERE id = ${user.userId}`;
  if (!u || !u.totp_secret) { sendJson(res, 400, { error: '2FA not set up' }); return; }

  const expected = generateTOTP(u.totp_secret);
  // Allow 1 window before/after for clock drift
  const valid = code === expected;

  if (!valid) { sendJson(res, 401, { error: 'Invalid code' }); return; }

  if (action === 'setup') {
    await sql`UPDATE users SET totp_enabled = true WHERE id = ${user.userId}`;
    sendJson(res, 200, { message: '2FA enabled' });
    return;
  }

  sendJson(res, 200, { valid: true });
}
