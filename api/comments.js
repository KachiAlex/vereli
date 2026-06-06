import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { workAreaId } = req.query || {};
    let rows;
    if (workAreaId) {
      rows = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE user_id = ${user.userId} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
    }
    const data = rows.map(r => ({
      id: r.id,
      workAreaId: r.work_area_id,
      authorName: r.author_name,
      authorInitials: r.author_initials,
      authorBg: r.author_bg,
      authorTc: r.author_tc,
      text: r.text,
      reference: r.reference,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { workAreaId, authorName, authorInitials, authorBg, authorTc, text, reference } = req.body || {};
    if (!workAreaId || !text) { badRequest(res, 'workAreaId and text are required'); return; }
    const [row] = await sql`
      INSERT INTO comments (user_id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference)
      VALUES (${user.userId}, ${Number(workAreaId)}, ${authorName || 'Anonymous'}, ${authorInitials || null}, ${authorBg || null}, ${authorTc || null}, ${text}, ${reference || null})
      RETURNING id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, authorName: row.author_name, authorInitials: row.author_initials, authorBg: row.author_bg, authorTc: row.author_tc, text: row.text, reference: row.reference, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
