import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { createTokens } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    badRequest(res, 'email and password are required');
    return;
  }

  try {
    const [user] = await sql`SELECT id, email, name, role, password_hash FROM users WHERE email = ${email.toLowerCase()}`;
    if (!user || user.password_hash !== password) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const { accessToken, refreshToken } = await createTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    sendJson(res, 200, {
      data: { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
