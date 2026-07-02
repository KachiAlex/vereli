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
      ? await sql`SELECT id, work_area_id, item, status, created_at FROM approvals WHERE id = ${id}`
      : await sql`SELECT id, work_area_id, item, status, created_at FROM approvals WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, item: row.item, status: row.status, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { item, status } = req.body || {};
    const fields = [];
    const values = [];
    if (item !== undefined) { fields.push('item = $' + (fields.length + 1)); values.push(item); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = user.role === 'superadmin'
      ? `UPDATE approvals SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, work_area_id, item, status, created_at`
      : `UPDATE approvals SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, work_area_id, item, status, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, workAreaId: row.work_area_id, item: row.item, status: row.status, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM approvals WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM approvals WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Approval deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
