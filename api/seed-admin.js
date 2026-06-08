import { sendJson, handleCors } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    // Create superadmin without tenant_id (NULL = global access to all tenants)
    // First check if superadmin already exists
    const [existingSuperadmin] = await sql`
      SELECT id FROM users WHERE email = 'admin@vereli.com' AND role = 'superadmin'
    `;

    if (existingSuperadmin) {
      sendJson(res, 200, { message: 'Superadmin already exists', data: { id: existingSuperadmin.id, email: 'admin@vereli.com', role: 'superadmin' } });
      return;
    }

    // Upgrade existing admin@vereli.com if present
    const [existingAdmin] = await sql`
      SELECT id FROM users WHERE email = 'admin@vereli.com'
    `;

    if (existingAdmin) {
      const [updated] = await sql`
        UPDATE users SET role = 'superadmin', tenant_id = NULL WHERE id = ${existingAdmin.id}
        RETURNING id, email, name, role;
      `;
      sendJson(res, 200, { message: 'Existing admin upgraded to superadmin.', data: updated });
      return;
    }

    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, role, tenant_id)
      VALUES ('admin@vereli.com', 'admin123', 'Super Admin', 'superadmin', NULL)
      RETURNING id, email, name, role;
    `;
    sendJson(res, 200, { message: 'Superadmin created successfully. This account has global access to manage all tenants.', data: user });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
