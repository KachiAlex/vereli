import { sendJson, handleCors, badRequest, setCookie } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { createTokens } from '../lib/auth.js';
import bcryptjs from 'bcryptjs';
import { checkRateLimit } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  if (checkRateLimit(req, { windowMs: 15 * 60 * 1000, maxRequests: 5 })) {
    sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    badRequest(res, 'email and password are required');
    return;
  }

  try {
    // Fetch user with tenant info
    const [user] = await sql`
      SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.password_hash, t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = ${email.toLowerCase()}
    `;

    if (!user) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const valid = await bcryptjs.compare(password, user.password_hash);
    if (!valid) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    // Ensure admin@vereli.com always has superadmin role
    let role = user.role;
    if (user.email.toLowerCase() === 'admin@vereli.com') {
      role = 'superadmin';
      if (user.role !== 'superadmin') {
        await sql`UPDATE users SET role = 'superadmin', tenant_id = NULL WHERE id = ${user.id}`;
      }
    }

    // Superadmin must use different credentials
    if (role === 'superadmin' && email.toLowerCase() !== 'admin@vereli.com') {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const { accessToken, refreshToken } = await createTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      tenantId: role === 'superadmin' ? null : user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
    });

    setCookie(res, 'access_token', accessToken, 900);   // 15 min
    setCookie(res, 'refresh_token', refreshToken, 604800); // 7 days

    sendJson(res, 200, {
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: user.tenant_name,
          tenantSlug: user.tenant_slug,
        }
      }
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
