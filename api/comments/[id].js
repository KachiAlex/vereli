import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, authorName: row.author_name, authorInitials: row.author_initials, authorBg: row.author_bg, authorTc: row.author_tc, text: row.text, reference: row.reference, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { text, reference } = req.body || {};
    const fields = [];
    const values = [];
    if (text !== undefined) { fields.push('text = $' + (fields.length + 1)); values.push(text); }
    if (reference !== undefined) { fields.push('reference = $' + (fields.length + 1)); values.push(reference || null); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = `UPDATE comments SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2} RETURNING id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at`;
    values.push(id, user.userId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, authorName: row.author_name, authorInitials: row.author_initials, authorBg: row.author_bg, authorTc: row.author_tc, text: row.text, reference: row.reference, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM comments WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Comment deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
