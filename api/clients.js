import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';
import { ensureAuditTable, logAudit } from './lib/audit.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // Check tenant access - superadmin can access all, regular users only their tenant
  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned to user' });
    return;
  }

  if (req.method === 'GET') {
    const { status, search } = req.query || {};
    let rows;

    // Ensure portal branding columns exist
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_logo TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_banner TEXT`;

    try {
      const conditions = [];
      const values = [];

      // Tenant filter
      if (user.role !== 'superadmin' || req.query.tenantId) {
        conditions.push('c.tenant_id = $' + (conditions.length + 1));
        values.push(user.role === 'superadmin' ? req.query.tenantId : tenantId);
      }

      // Status filter
      if (status) {
        conditions.push('c.status = $' + (conditions.length + 1));
        values.push(status);
      }

      // Search filter
      if (search) {
        conditions.push('(LOWER(c.name) LIKE $' + (conditions.length + 1) + ' OR LOWER(c.contact) LIKE $' + (conditions.length + 1) + ' OR LOWER(c.email) LIKE $' + (conditions.length + 1) + ')');
        values.push('%' + search.toLowerCase() + '%');
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const query = `SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c ${where} ORDER BY c.created_at DESC`;
      rows = await sql(query, values);
    } catch (err) {
      console.error('Error fetching clients:', err);
      sendJson(res, 500, { error: 'Failed to fetch clients' });
      return;
    }

    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      contact: r.contact,
      email: r.email,
      type: r.type || 'Service',
      status: r.status,
      portal: { on: r.portal_on, url: r.portal_url, logo: r.portal_logo, banner: r.portal_banner },
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    // Check if user can create data
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to create clients' });
      return;
    }

    const { name, contact, email, type = 'Service', status = 'active', portal_on, portal_url, portal_logo, portal_banner } = req.body || {};
    if (!name || !contact || !email) {
      badRequest(res, 'name, contact, and email are required');
      return;
    }
    
    // Check if client email already exists in this tenant
    const [existing] = await sql`
      SELECT id FROM clients WHERE email = ${email.toLowerCase()} AND tenant_id = ${tenantId}
    `;
    if (existing) {
      sendJson(res, 409, { error: 'Client with this email already exists in your workspace' });
      return;
    }
    
    // Ensure portal branding columns exist
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_logo TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_banner TEXT`;

    let row;
    try {
      [row] = await sql`
        INSERT INTO clients (tenant_id, user_id, name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner)
        VALUES (${tenantId}, ${user.userId}, ${name}, ${contact}, ${email.toLowerCase()}, ${type}, ${status}, ${portal_on ?? false}, ${portal_url ?? ''}, ${portal_logo ?? ''}, ${portal_banner ?? ''})
        RETURNING id, name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner, created_at;
      `;
    } catch (err) {
      console.error('Error creating client:', err);
      sendJson(res, 500, { error: 'Failed to create client' });
      return;
    }
    
    const client = {
      id: row.id,
      name: row.name,
      contact: row.contact,
      email: row.email,
      type: row.type || type,
      status: row.status,
      portal: { on: row.portal_on, url: row.portal_url, logo: row.portal_logo, banner: row.portal_banner },
      createdAt: row.created_at,
    };
    await ensureAuditTable();
    await logAudit({ tenantId, userId: user.userId, userEmail: user.email, action: 'create', entityType: 'client', entityId: row.id, newValue: client, ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress });
    sendJson(res, 201, { data: client });
    return;
  }

  badRequest(res, 'Method not allowed');
}
