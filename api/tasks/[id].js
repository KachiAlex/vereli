import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, text: row.text, done: row.done, assignee: row.assignee, status: row.status, priority: row.priority, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { text, done, assignee, status, priority } = req.body || {};
    const updates = [];
    if (text !== undefined) updates.push(sql`text = ${text}`);
    if (done !== undefined) updates.push(sql`done = ${!!done}`);
    if (assignee !== undefined) updates.push(sql`assignee = ${assignee || null}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (priority !== undefined) updates.push(sql`priority = ${priority}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }
    const [row] = await sql`UPDATE tasks SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId} RETURNING id, work_area_id, text, done, assignee, status, priority, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, text: row.text, done: row.done, assignee: row.assignee, status: row.status, priority: row.priority, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM tasks WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Task deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
