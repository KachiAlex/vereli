import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { createTokens } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { email, password, name, company } = req.body || {};
  if (!email || !password || !name) {
    badRequest(res, 'email, password, and name are required');
    return;
  }

  try {
    const [existing] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing) {
      sendJson(res, 409, { error: 'Email already registered' });
      return;
    }

    let user;
    try {
      [user] = await sql`
        INSERT INTO users (email, password_hash, name, company, role)
        VALUES (${email.toLowerCase()}, ${password}, ${name}, ${company || null}, 'owner')
        RETURNING id, email, name, company, role;
      `;
    } catch (colErr) {
      // company column may not exist yet in old databases
      [user] = await sql`
        INSERT INTO users (email, password_hash, name, role)
        VALUES (${email.toLowerCase()}, ${password}, ${name}, 'owner')
        RETURNING id, email, name, role;
      `;
    }

    const { accessToken, refreshToken } = await createTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      company: user.company,
      role: user.role,
    });

    sendJson(res, 201, {
      data: { user: { id: user.id, email: user.email, name: user.name, company: user.company, role: user.role } },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
