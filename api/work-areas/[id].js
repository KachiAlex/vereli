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
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (type !== undefined) { fields.push('type = $' + (fields.length + 1)); values.push(type); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (progress !== undefined) { fields.push('progress = $' + (fields.length + 1)); values.push(Number(progress)); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = `UPDATE work_areas SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2} RETURNING id, client_id, name, type, status, progress, created_at`;
    values.push(id, user.userId);
    const [row] = await sql(query, values);
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
