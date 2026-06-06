import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM team_members WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Team member removed' });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, role, status } = req.body || {};
    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (role !== undefined) updates.push(sql`role = ${role}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }

    const [row] = await sql`
      UPDATE team_members SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId}
      RETURNING id, email, name, role, status, created_at;
    `;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
