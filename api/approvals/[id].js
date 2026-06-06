import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, work_area_id, item, status, created_at FROM approvals WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, item: row.item, status: row.status, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { item, status } = req.body || {};
    const updates = [];
    if (item !== undefined) updates.push(sql`item = ${item}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }
    const [row] = await sql`UPDATE approvals SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId} RETURNING id, work_area_id, item, status, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, item: row.item, status: row.status, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM approvals WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Approval deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
