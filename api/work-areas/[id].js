import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, name: row.name, type: row.type, status: row.status, progress: row.progress, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, type, status, progress } = req.body || {};
    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (type !== undefined) updates.push(sql`type = ${type}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (progress !== undefined) updates.push(sql`progress = ${Number(progress)}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }
    const [row] = await sql`UPDATE work_areas SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId} RETURNING id, client_id, name, type, status, progress, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, name: row.name, type: row.type, status: row.status, progress: row.progress, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM work_areas WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Work area deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
