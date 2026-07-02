import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  await sql`
    CREATE TABLE IF NOT EXISTS timesheets (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      description TEXT,
      hours NUMERIC(4,2) NOT NULL,
      logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
      billable BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  if (req.method === 'GET') {
    try {
      const { userId, taskId, projectId, clientId, date, startDate, endDate } = req.query || {};
      let rows;

      if (user.role !== 'superadmin') {
        // Non-superadmins can only see their own or their tenant's timesheets
        rows = await sql`
          SELECT t.id, t.user_id, t.task_id, t.project_id, t.client_id, t.description, t.hours, t.logged_date, t.billable, t.created_at,
            u.name as user_name, cl.name as client_name, p.name as project_name
          FROM timesheets t
          LEFT JOIN users u ON t.user_id = u.id
          LEFT JOIN clients cl ON t.client_id = cl.id
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE t.tenant_id = ${targetTenantId}
          ORDER BY t.logged_date DESC, t.created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT t.id, t.user_id, t.task_id, t.project_id, t.client_id, t.description, t.hours, t.logged_date, t.billable, t.created_at,
            u.name as user_name, cl.name as client_name, p.name as project_name
          FROM timesheets t
          LEFT JOIN users u ON t.user_id = u.id
          LEFT JOIN clients cl ON t.client_id = cl.id
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE t.tenant_id = ${targetTenantId}
          ORDER BY t.logged_date DESC, t.created_at DESC
        `;
      }

      const data = rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        taskId: r.task_id,
        projectId: r.project_id,
        projectName: r.project_name,
        clientId: r.client_id,
        clientName: r.client_name,
        description: r.description,
        hours: Number(r.hours),
        loggedDate: r.logged_date,
        billable: r.billable,
        createdAt: r.created_at,
      }));

      sendJson(res, 200, { data });
    } catch (err) {
      console.error('Error fetching timesheets:', err);
      sendJson(res, 500, { error: 'Failed to fetch timesheets' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { taskId, projectId, clientId, description, hours, loggedDate, billable = true } = req.body || {};
    if (hours === undefined || Number(hours) <= 0) {
      badRequest(res, 'hours is required and must be > 0');
      return;
    }

    try {
      const [row] = await sql`
        INSERT INTO timesheets (tenant_id, user_id, task_id, project_id, client_id, description, hours, logged_date, billable)
        VALUES (${targetTenantId}, ${user.userId}, ${taskId || null}, ${projectId || null}, ${clientId || null}, ${description || null}, ${Number(hours)}, ${loggedDate || 'CURRENT_DATE'}, ${billable})
        RETURNING id, user_id, task_id, project_id, client_id, description, hours, logged_date, billable, created_at;
      `;
      sendJson(res, 201, {
        data: {
          id: row.id,
          userId: row.user_id,
          taskId: row.task_id,
          projectId: row.project_id,
          clientId: row.client_id,
          description: row.description,
          hours: Number(row.hours),
          loggedDate: row.logged_date,
          billable: row.billable,
          createdAt: row.created_at,
        }
      });
    } catch (err) {
      console.error('Error creating timesheet entry:', err);
      sendJson(res, 500, { error: 'Failed to log time' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) { badRequest(res, 'id is required'); return; }

    try {
      const [row] = user.role === 'superadmin'
        ? await sql`DELETE FROM timesheets WHERE id = ${Number(id)} RETURNING id`
        : await sql`DELETE FROM timesheets WHERE id = ${Number(id)} AND tenant_id = ${targetTenantId} RETURNING id`;
      if (!row) { sendJson(res, 404, { error: 'Not found' }); return; }
      sendJson(res, 200, { message: 'Time entry deleted' });
    } catch (err) {
      console.error('Error deleting timesheet:', err);
      sendJson(res, 500, { error: 'Failed to delete' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
