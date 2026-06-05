import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { createTokens } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { email, password, name } = req.body || {};
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

    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (${email.toLowerCase()}, ${password}, ${name}, 'owner')
      RETURNING id, email, name, role;
    `;

    const { accessToken, refreshToken } = await createTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    sendJson(res, 201, {
      data: { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
