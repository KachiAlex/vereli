import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, client_id, name, status, budget, tasks_total, tasks_pending, created_at FROM projects WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, name: row.name, status: row.status, budget: row.budget, tasksTotal: row.tasks_total, tasksPending: row.tasks_pending, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, status, budget, tasks_total, tasks_pending } = req.body || {};
    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (budget !== undefined) updates.push(sql`budget = ${Number(budget)}`);
    if (tasks_total !== undefined) updates.push(sql`tasks_total = ${Number(tasks_total)}`);
    if (tasks_pending !== undefined) updates.push(sql`tasks_pending = ${Number(tasks_pending)}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }
    const [row] = await sql`UPDATE projects SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId} RETURNING id, client_id, name, status, budget, tasks_total, tasks_pending, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, name: row.name, status: row.status, budget: row.budget, tasksTotal: row.tasks_total, tasksPending: row.tasks_pending, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM projects WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Project deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
