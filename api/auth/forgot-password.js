import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { sendEmail } from '../lib/email.js';
import crypto from 'crypto';
import { checkRateLimit } from '../lib/rate-limit.js';

const NOTIFY_EMAIL = 'vereli.app@gmail.com';

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

  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    badRequest(res, 'Valid email is required');
    return;
  }

  try {
    // Ensure password_resets table exists
    await sql`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const [user] = await sql`SELECT id, name FROM users WHERE email = ${normalizedEmail}`;
    if (!user) {
      // Still return 200 to prevent email enumeration
      sendJson(res, 200, { message: 'If an account exists, a reset link has been sent.' });
      return;
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration

    // Invalidate any existing unused tokens for this email
    await sql`UPDATE password_resets SET used = true WHERE email = ${normalizedEmail} AND used = false`;

    // Store new token
    await sql`
      INSERT INTO password_resets (email, token, expires_at)
      VALUES (${normalizedEmail}, ${token}, ${expiresAt.toISOString()})
    `;

    // Send reset email
    try {
      const baseUrl = process.env.APP_URL || '';
      const resetUrl = `${baseUrl}/reset-password/?token=${token}`;
      await sendEmail({
        to: normalizedEmail,
        subject: 'Reset your Vereli password',
        html: `
          <h2>Password reset requested</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Click the link below to reset your Vereli password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="padding:12px 20px;background:#17A39B;color:#fff;text-decoration:none;border-radius:8px;display:inline-block">Reset password</a></p>
          <p>Or copy and paste this URL: ${resetUrl}</p>
          <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore it.</p>
        `,
      });
    } catch (err) {
      console.error('Reset email error:', err);
    }

    sendJson(res, 200, { message: 'If an account exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
