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
    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (type !== undefined) updates.push(sql`type = ${type}`);
    if (size !== undefined) updates.push(sql`size = ${size || null}`);
    if (visibility !== undefined) updates.push(sql`visibility = ${visibility}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }
    const [row] = await sql`UPDATE files SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId} RETURNING id, work_area_id, name, type, size, visibility, uploader_name, created_at`;
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
