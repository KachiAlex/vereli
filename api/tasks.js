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
      rows = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE user_id = ${user.userId} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at`;
    } else {
      rows = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE user_id = ${user.userId} ORDER BY created_at`;
    }
    const data = rows.map(r => ({
      id: r.id,
      workAreaId: r.work_area_id,
      text: r.text,
      done: r.done,
      assignee: r.assignee,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { workAreaId, text, assignee, status = 'todo', priority = 'medium' } = req.body || {};
    if (!workAreaId || !text) { badRequest(res, 'workAreaId and text are required'); return; }
    const [row] = await sql`
      INSERT INTO tasks (user_id, work_area_id, text, assignee, status, priority)
      VALUES (${user.userId}, ${Number(workAreaId)}, ${text}, ${assignee || null}, ${status}, ${priority})
      RETURNING id, work_area_id, text, done, assignee, status, priority, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, text: row.text, done: row.done, assignee: row.assignee, status: row.status, priority: row.priority, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
