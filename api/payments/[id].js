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
      ? await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE id = ${id}`
      : await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, invoiceId: row.invoice_id, amount: row.amount, currency: row.currency, method: row.method, note: row.note, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { amount, currency, method, note } = req.body || {};
    const fields = [];
    const values = [];
    if (amount !== undefined) { fields.push('amount = $' + (fields.length + 1)); values.push(Number(amount)); }
    if (currency !== undefined) { fields.push('currency = $' + (fields.length + 1)); values.push(currency); }
    if (method !== undefined) { fields.push('method = $' + (fields.length + 1)); values.push(method); }
    if (note !== undefined) { fields.push('note = $' + (fields.length + 1)); values.push(note); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = user.role === 'superadmin'
      ? `UPDATE payments SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, invoice_id, amount, currency, method, note, created_at`
      : `UPDATE payments SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, invoice_id, amount, currency, method, note, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, invoiceId: row.invoice_id, amount: row.amount, currency: row.currency, method: row.method, note: row.note, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM payments WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM payments WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Payment deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
