import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { clientId } = req.query || {};
    let rows;
    if (clientId) {
      rows = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE user_id = ${user.userId} AND client_id = ${Number(clientId)} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
    }
    const data = rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      type: r.type,
      status: r.status,
      progress: r.progress,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { clientId, name, type = 'general', status = 'active', progress = 0 } = req.body || {};
    if (!clientId || !name) { badRequest(res, 'clientId and name are required'); return; }
    const [row] = await sql`
      INSERT INTO work_areas (user_id, client_id, name, type, status, progress)
      VALUES (${user.userId}, ${Number(clientId)}, ${name}, ${type}, ${status}, ${Number(progress) || 0})
      RETURNING id, client_id, name, type, status, progress, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, clientId: row.client_id, name: row.name, type: row.type, status: row.status, progress: row.progress, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
