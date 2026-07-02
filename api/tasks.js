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
    const { workAreaId } = req.query || {};
    let rows;
    
    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (workAreaId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE work_area_id = ${Number(workAreaId)} ORDER BY created_at`;
        } else {
          rows = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE tenant_id = ${tid} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks ORDER BY created_at`;
        } else {
          rows = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE tenant_id = ${tid} ORDER BY created_at`;
        }
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      sendJson(res, 500, { error: 'Failed to fetch tasks' });
      return;
    }
    const data = rows.map(r => ({
      id: r.id,
      workAreaId: r.work_area_id,
      text: r.text,
      done: r.done,
      assignee: r.assignee,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to create tasks' });
      return;
    }

    const { workAreaId, text, assignee, status = 'todo', priority = 'medium' } = req.body || {};
    if (!workAreaId || !text) { badRequest(res, 'workAreaId and text are required'); return; }
    
    // Verify work area belongs to tenant
    const [workArea] = await sql`SELECT id FROM work_areas WHERE id = ${Number(workAreaId)} AND tenant_id = ${tenantId}`;
    if (!workArea) {
      sendJson(res, 404, { error: 'Work area not found in your workspace' });
      return;
    }
    
    const [row] = await sql`
      INSERT INTO tasks (tenant_id, user_id, work_area_id, text, assignee, status, priority)
      VALUES (${tenantId}, ${user.userId}, ${Number(workAreaId)}, ${text}, ${assignee || null}, ${status}, ${priority})
      RETURNING id, work_area_id, text, done, assignee, status, priority, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, text: row.text, done: row.done, assignee: row.assignee, status: row.status, priority: row.priority, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
