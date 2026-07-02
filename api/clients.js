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
    
    try {
      // Build query with tenant filtering
      let baseQuery = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c`;
      
      // Apply tenant filter (superadmin sees all, others see only their tenant)
      if (user.role === 'superadmin') {
        if (req.query.tenantId) {
          baseQuery = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.tenant_id = ${req.query.tenantId}`;
        } else {
          baseQuery = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c`;
        }
      } else {
        baseQuery = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.tenant_id = ${tenantId}`;
      }
      
      // Apply filters
      let query = baseQuery;
      if (status && user.role === 'superadmin' && !req.query.tenantId) {
        query = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.status = ${status}`;
      } else if (status) {
        query = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.tenant_id = ${tenantId} AND c.status = ${status}`;
      }
      
      if (search) {
        const q = `%${search.toLowerCase()}%`;
        if (user.role === 'superadmin' && !req.query.tenantId) {
          query = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE (LOWER(c.name) LIKE ${q} OR LOWER(c.contact) LIKE ${q} OR LOWER(c.email) LIKE ${q})`;
        } else {
          const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
          query = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.tenant_id = ${tid} AND (LOWER(c.name) LIKE ${q} OR LOWER(c.contact) LIKE ${q} OR LOWER(c.email) LIKE ${q})`;
        }
      }
      
      if (status && search) {
        const q = `%${search.toLowerCase()}%`;
        if (user.role === 'superadmin' && !req.query.tenantId) {
          query = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.status = ${status} AND (LOWER(c.name) LIKE ${q} OR LOWER(c.contact) LIKE ${q} OR LOWER(c.email) LIKE ${q})`;
        } else {
          const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
          query = sql`SELECT c.id, c.name, c.contact, c.email, c.type, c.status, c.portal_on, c.portal_url, c.created_at FROM clients c WHERE c.tenant_id = ${tid} AND c.status = ${status} AND (LOWER(c.name) LIKE ${q} OR LOWER(c.contact) LIKE ${q} OR LOWER(c.email) LIKE ${q})`;
        }
      }
      
      rows = await query;
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
      portal: { on: r.portal_on, url: r.portal_url },
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

    const { name, contact, email, type = 'Service', status = 'active' } = req.body || {};
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
    
    let row;
    try {
      [row] = await sql`
        INSERT INTO clients (tenant_id, user_id, name, contact, email, type, status)
        VALUES (${tenantId}, ${user.userId}, ${name}, ${contact}, ${email.toLowerCase()}, ${type}, ${status})
        RETURNING id, name, contact, email, type, status, portal_on, portal_url, created_at;
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
      portal: { on: row.portal_on, url: row.portal_url },
      createdAt: row.created_at,
    };
    await ensureAuditTable();
    await logAudit({ tenantId, userId: user.userId, userEmail: user.email, action: 'create', entityType: 'client', entityId: row.id, newValue: client, ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress });
    sendJson(res, 201, { data: client });
    return;
  }

  badRequest(res, 'Method not allowed');
}
