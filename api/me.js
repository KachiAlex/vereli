import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    // Fetch full user data with tenant info
    const [userData] = await sql`
      SELECT u.id, u.email, u.name, u.role, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ${user.userId}
    `;
    
    sendJson(res, 200, {
      data: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        tenantId: userData.tenant_id,
        tenantName: userData.tenant_name,
        tenantSlug: userData.tenant_slug,
        tenantStatus: userData.tenant_status,
        company: userData.tenant_name || null,
      },
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, company } = req.body || {};
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }

    let row;
    if (fields.length > 0) {
      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, email, name, role, tenant_id`;
      values.push(user.userId);
      try {
        [row] = await sql(query, values);
      } catch (err) {
        console.error('Error updating user:', err);
        badRequest(res, 'Update failed');
        return;
      }
      if (!row) { badRequest(res, 'Update failed'); return; }
    } else {
      const [existing] = await sql`SELECT id, email, name, role, tenant_id FROM users WHERE id = ${user.userId}`;
      row = existing;
    }

    // Update tenant name if company provided
    if (company !== undefined && row.tenant_id) {
      await sql`UPDATE tenants SET name = ${company} WHERE id = ${row.tenant_id}`;
    }

    if (!name && company === undefined) { badRequest(res, 'No fields to update'); return; }

    // Get tenant info
    const [tenant] = await sql`SELECT name, slug, status FROM tenants WHERE id = ${row.tenant_id}`;
    
    sendJson(res, 200, {
      data: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        tenantId: row.tenant_id,
        tenantName: tenant?.name || null,
        tenantSlug: tenant?.slug || null,
        tenantStatus: tenant?.status || null,
        company: tenant?.name || null,
      },
    });
    return;
  }

  badRequest(res, 'Method not allowed');
}
