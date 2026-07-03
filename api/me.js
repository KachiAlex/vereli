import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    // Fetch full user data with tenant info
    const [userData] = await sql`
      SELECT u.id, u.email, u.name, u.role, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status, t.logo_url, t.primary_color
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ${user.userId}
    `;

    if (!userData) {
      sendJson(res, 404, { error: 'User not found' });
      return;
    }

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
        logoUrl: userData.logo_url || null,
        primary: userData.primary_color || null,
      },
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, company, logoUrl, primary } = req.body || {};
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

    // Update tenant branding if any branding fields provided
    if (row.tenant_id && (company !== undefined || logoUrl !== undefined || primary !== undefined)) {
      const tFields = [];
      const tValues = [];
      if (company !== undefined) { tFields.push('name = $' + (tFields.length + 1)); tValues.push(company); }
      if (logoUrl !== undefined) { tFields.push('logo_url = $' + (tFields.length + 1)); tValues.push(logoUrl); }
      if (primary !== undefined) { tFields.push('primary_color = $' + (tFields.length + 1)); tValues.push(primary); }
      if (tFields.length > 0) {
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color TEXT`;
        const tQuery = `UPDATE tenants SET ${tFields.join(', ')} WHERE id = $${tFields.length + 1}`;
        tValues.push(row.tenant_id);
        await sql(tQuery, tValues);
      }
    }

    if (!name && company === undefined && logoUrl === undefined && primary === undefined) { badRequest(res, 'No fields to update'); return; }

    // Get tenant info
    const [tenant] = await sql`SELECT name, slug, status, logo_url, primary_color FROM tenants WHERE id = ${row.tenant_id}`;
    
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
        logoUrl: tenant?.logo_url || null,
        primary: tenant?.primary_color || null,
      },
    });
    return;
  }

  badRequest(res, 'Method not allowed');
}
