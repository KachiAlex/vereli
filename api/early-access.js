import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { sql } from './lib/neon.js';

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
    await sql`
      INSERT INTO early_access (email, name, company)
      VALUES (${email.toLowerCase().trim()}, ${name || null}, ${company || null})
      ON CONFLICT (email) DO NOTHING;
    `;
    sendJson(res, 200, { message: 'You are on the list. We will be in touch soon.', success: true });
  } catch (err) {
    console.error('Early access error:', err);
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
