import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import bcryptjs from 'bcryptjs';
import { checkRateLimit } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  if (checkRateLimit(req, { windowMs: 15 * 60 * 1000, maxRequests: 3 })) {
    sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
    return;
  }

  const { token, password } = req.body || {};
  if (!token || !password || password.length < 6) {
    badRequest(res, 'Token and password (min 6 chars) are required');
    return;
  }

  try {
    // Find valid, unused, non-expired token
    const [reset] = await sql`
      SELECT id, email, expires_at, used 
      FROM password_resets 
      WHERE token = ${token} 
      LIMIT 1
    `;

    if (!reset) {
      sendJson(res, 400, { error: 'Invalid or expired reset token' });
      return;
    }

    if (reset.used) {
      sendJson(res, 400, { error: 'Reset token already used' });
      return;
    }

    if (new Date(reset.expires_at) < new Date()) {
      sendJson(res, 400, { error: 'Reset token has expired' });
      return;
    }

    // Hash new password
    const passwordHash = await bcryptjs.hash(password, 12);

    // Update user password
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE email = ${reset.email}`;

    // Mark token as used
    await sql`UPDATE password_resets SET used = true WHERE id = ${reset.id}`;

    sendJson(res, 200, { message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
