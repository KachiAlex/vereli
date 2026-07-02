import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { token } = req.body || {};
  if (!token) {
    badRequest(res, 'Verification token is required');
    return;
  }

  try {
    // Ensure column exists
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`;

    // Find valid token
    const [record] = await sql`
      SELECT id, email, expires_at, used 
      FROM email_verification_tokens 
      WHERE token = ${token} 
      LIMIT 1
    `;

    if (!record) {
      sendJson(res, 400, { error: 'Invalid verification token' });
      return;
    }

    if (record.used) {
      sendJson(res, 400, { error: 'Token already used' });
      return;
    }

    if (new Date(record.expires_at) < new Date()) {
      sendJson(res, 400, { error: 'Verification token has expired' });
      return;
    }

    // Mark email as verified
    await sql`UPDATE users SET email_verified = true WHERE email = ${record.email}`;

    // Mark token as used
    await sql`UPDATE email_verification_tokens SET used = true WHERE id = ${record.id}`;

    sendJson(res, 200, { message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify email error:', err);
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
