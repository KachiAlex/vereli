import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = user.role === 'superadmin'
      ? await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE id = ${id}`
      : await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, text: row.text, done: row.done, assignee: row.assignee, status: row.status, priority: row.priority, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { text, done, assignee, status, priority } = req.body || {};
    const fields = [];
    const values = [];
    if (text !== undefined) { fields.push('text = $' + (fields.length + 1)); values.push(text); }
    if (done !== undefined) { fields.push('done = $' + (fields.length + 1)); values.push(!!done); }
    if (assignee !== undefined) { fields.push('assignee = $' + (fields.length + 1)); values.push(assignee || null); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (priority !== undefined) { fields.push('priority = $' + (fields.length + 1)); values.push(priority); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = user.role === 'superadmin'
      ? `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, work_area_id, text, done, assignee, status, priority, created_at`
      : `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, work_area_id, text, done, assignee, status, priority, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, text: row.text, done: row.done, assignee: row.assignee, status: row.status, priority: row.priority, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM tasks WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM tasks WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Task deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
