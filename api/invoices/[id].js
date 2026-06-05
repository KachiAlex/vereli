import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, created_at FROM invoices WHERE id = ${id} AND user_id = ${user.userId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, projectId: row.project_id, amount: row.amount, currency: row.currency, status: row.status, dueDate: row.due_date, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { amount, currency, status, due_date } = req.body || {};
    const updates = [];
    if (amount !== undefined) updates.push(sql`amount = ${Number(amount)}`);
    if (currency !== undefined) updates.push(sql`currency = ${currency}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (due_date !== undefined) updates.push(sql`due_date = ${due_date}`);
    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }
    const [row] = await sql`UPDATE invoices SET ${sql.join(updates, sql`, `)} WHERE id = ${id} AND user_id = ${user.userId} RETURNING id, client_id, project_id, amount, currency, status, due_date, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, projectId: row.project_id, amount: row.amount, currency: row.currency, status: row.status, dueDate: row.due_date, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM invoices WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Invoice deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
