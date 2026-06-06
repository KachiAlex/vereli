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
      rows = await sql`SELECT id, work_area_id, item, status, created_at FROM approvals WHERE user_id = ${user.userId} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT id, work_area_id, item, status, created_at FROM approvals WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
    }
    const data = rows.map(r => ({
      id: r.id,
      workAreaId: r.work_area_id,
      item: r.item,
      status: r.status,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { workAreaId, item, status = 'waiting' } = req.body || {};
    if (!workAreaId || !item) { badRequest(res, 'workAreaId and item are required'); return; }
    const [row] = await sql`
      INSERT INTO approvals (user_id, work_area_id, item, status)
      VALUES (${user.userId}, ${Number(workAreaId)}, ${item}, ${status})
      RETURNING id, work_area_id, item, status, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, item: row.item, status: row.status, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
