import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, work_area_id, name, type, size, visibility, uploader_name, created_at FROM files WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, name: row.name, type: row.type, size: row.size, visibility: row.visibility, uploaderName: row.uploader_name, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, type, size, visibility } = req.body || {};
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (type !== undefined) { fields.push('type = $' + (fields.length + 1)); values.push(type); }
    if (size !== undefined) { fields.push('size = $' + (fields.length + 1)); values.push(size || null); }
    if (visibility !== undefined) { fields.push('visibility = $' + (fields.length + 1)); values.push(visibility); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = `UPDATE files SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2} RETURNING id, work_area_id, name, type, size, visibility, uploader_name, created_at`;
    values.push(id, user.userId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, name: row.name, type: row.type, size: row.size, visibility: row.visibility, uploaderName: row.uploader_name, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM files WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'File deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
