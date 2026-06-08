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
    // Fetch user with tenant info
    const [user] = await sql`
      SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.password_hash, t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = ${email.toLowerCase()}
    `;
    
    if (!user || user.password_hash !== password) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    // Superadmin must use different credentials
    if (user.role === 'superadmin' && email.toLowerCase() !== 'admin@vereli.com') {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const { accessToken, refreshToken } = await createTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
    });

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
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
