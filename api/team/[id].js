import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = user.role === 'superadmin'
      ? await sql`SELECT id, email, name, role, status, created_at FROM team_members WHERE id = ${id}`
      : await sql`SELECT id, email, name, role, status, created_at FROM team_members WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM team_members WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM team_members WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Team member removed' });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, role, status } = req.body || {};
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (role !== undefined) { fields.push('role = $' + (fields.length + 1)); values.push(role); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }

    const query = user.role === 'superadmin'
      ? `UPDATE team_members SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, email, name, role, status, created_at`
      : `UPDATE team_members SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, email, name, role, status, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
