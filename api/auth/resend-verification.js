import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { sendEmail } from '../lib/email.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { email } = req.body || {};
  if (!email) {
    badRequest(res, 'Email is required');
    return;
  }

  try {
    await sql`CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await sql`SELECT id, name, email_verified FROM users WHERE email = ${normalizedEmail}`;

    if (!user) {
      sendJson(res, 200, { message: 'If an account exists, a verification email has been sent.' });
      return;
    }

    if (user.email_verified) {
      sendJson(res, 200, { message: 'Email is already verified' });
      return;
    }

    // Invalidate old tokens
    await sql`UPDATE email_verification_tokens SET used = true WHERE email = ${normalizedEmail} AND used = false`;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await sql`
      INSERT INTO email_verification_tokens (email, token, expires_at)
      VALUES (${normalizedEmail}, ${token}, ${expiresAt.toISOString()})
    `;

    try {
      const baseUrl = process.env.APP_URL || '';
      const verifyUrl = `${baseUrl}/verify-email/?token=${token}`;
      await sendEmail({
        to: normalizedEmail,
        subject: 'Verify your email address',
        html: `
          <h2>Verify your email</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${verifyUrl}" style="padding:12px 20px;background:#17A39B;color:#fff;text-decoration:none;border-radius:8px;display:inline-block">Verify email</a></p>
          <p>Or copy and paste: ${verifyUrl}</p>
          <p style="color:#888;font-size:12px">This link expires in 24 hours.</p>
        `,
      });
    } catch (err) {
      console.error('Verification email error:', err);
    }

    sendJson(res, 200, { message: 'If an account exists, a verification email has been sent.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
