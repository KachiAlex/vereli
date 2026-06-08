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
    const { clientId, status } = req.query || {};
    let rows;

    try {
      // Base query with tenant filtering
      let baseQuery = sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p`;
      
      // Apply tenant filter
      if (user.role === 'superadmin' && req.query.tenantId) {
        baseQuery = sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.tenant_id = ${req.query.tenantId}`;
      } else if (user.role !== 'superadmin') {
        baseQuery = sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.tenant_id = ${tenantId}`;
      }

      // Apply additional filters
      if (clientId && status) {
        const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.client_id = ${Number(clientId)} AND p.status = ${status}`;
        } else {
          rows = await sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.tenant_id = ${tid} AND p.client_id = ${Number(clientId)} AND p.status = ${status}`;
        }
      } else if (clientId) {
        const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.client_id = ${Number(clientId)}`;
        } else {
          rows = await sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.tenant_id = ${tid} AND p.client_id = ${Number(clientId)}`;
        }
      } else if (status) {
        const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.status = ${status}`;
        } else {
          rows = await sql`SELECT p.id, p.client_id, p.name, p.status, p.budget, p.tasks_total, p.tasks_pending, p.created_at FROM projects p WHERE p.tenant_id = ${tid} AND p.status = ${status}`;
        }
      } else {
        rows = await baseQuery;
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
      sendJson(res, 500, { error: 'Failed to fetch projects' });
      return;
    }

    const data = rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      status: r.status,
      budget: r.budget,
      tasksTotal: r.tasks_total,
      tasksPending: r.tasks_pending,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    // Check permissions
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to create projects' });
      return;
    }

    const { clientId, name, budget, status = 'pending' } = req.body || {};
    if (!clientId || !name) {
      badRequest(res, 'clientId and name are required');
      return;
    }

    // Verify client belongs to this tenant
    const [client] = await sql`SELECT id FROM clients WHERE id = ${Number(clientId)} AND tenant_id = ${tenantId}`;
    if (!client) {
      sendJson(res, 404, { error: 'Client not found in your workspace' });
      return;
    }

    try {
      const [row] = await sql`
        INSERT INTO projects (tenant_id, user_id, client_id, name, budget, status)
        VALUES (${tenantId}, ${user.userId}, ${Number(clientId)}, ${name}, ${Number(budget) || 0}, ${status})
        RETURNING id, client_id, name, status, budget, tasks_total, tasks_pending, created_at;
      `;
      
      const project = {
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        status: row.status,
        budget: row.budget,
        tasksTotal: row.tasks_total,
        tasksPending: row.tasks_pending,
        createdAt: row.created_at,
      };
      sendJson(res, 201, { data: project });
    } catch (err) {
      console.error('Error creating project:', err);
      sendJson(res, 500, { error: 'Failed to create project' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
