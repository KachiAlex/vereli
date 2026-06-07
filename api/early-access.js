import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { Resend } from 'resend';

const NOTIFY_EMAIL = 'vereli.app@gmail.com';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { email, name, company } = req.body || {};
  if (!email || !email.includes('@')) {
    badRequest(res, 'Valid email is required');
    return;
  }

  try {
    const result = await sql`
      INSERT INTO early_access (email, name, company)
      VALUES (${email.toLowerCase().trim()}, ${name || null}, ${company || null})
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `;

    if (result.length > 0 && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Vereli Early Access <onboarding@resend.dev>',
        to: NOTIFY_EMAIL,
        subject: 'New early access signup',
        html: `
          <p><strong>New signup on Vereli Early Access</strong></p>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><strong>${email.toLowerCase().trim()}</strong></td></tr>
            ${name ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td>${name}</td></tr>` : ''}
            ${company ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Company</td><td>${company}</td></tr>` : ''}
          </table>
        `.trim()
      }).catch(err => console.error('Email send error:', err));
    }

    sendJson(res, 200, { message: 'You are on the list. We will be in touch soon.', success: true });
  } catch (err) {
    console.error('Early access error:', err);
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
