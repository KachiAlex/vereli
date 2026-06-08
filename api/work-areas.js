import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // Check tenant access
  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned to user' });
    return;
  }

  if (req.method === 'GET') {
    const { clientId } = req.query || {};
    let rows;
    
    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (clientId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE client_id = ${Number(clientId)} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE tenant_id = ${tid} AND client_id = ${Number(clientId)} ORDER BY created_at DESC`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
        }
      }
    } catch (err) {
      console.error('Error fetching work areas:', err);
      sendJson(res, 500, { error: 'Failed to fetch work areas' });
      return;
    }
    const data = rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      type: r.type,
      status: r.status,
      progress: r.progress,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to create work areas' });
      return;
    }

    const { clientId, name, type = 'general', status = 'active', progress = 0 } = req.body || {};
    if (!clientId || !name) { badRequest(res, 'clientId and name are required'); return; }
    
    // Verify client belongs to tenant
    const [client] = await sql`SELECT id FROM clients WHERE id = ${Number(clientId)} AND tenant_id = ${tenantId}`;
    if (!client) {
      sendJson(res, 404, { error: 'Client not found in your workspace' });
      return;
    }
    
    const [row] = await sql`
      INSERT INTO work_areas (tenant_id, user_id, client_id, name, type, status, progress)
      VALUES (${tenantId}, ${user.userId}, ${Number(clientId)}, ${name}, ${type}, ${status}, ${Number(progress) || 0})
      RETURNING id, client_id, name, type, status, progress, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, clientId: row.client_id, name: row.name, type: row.type, status: row.status, progress: row.progress, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
