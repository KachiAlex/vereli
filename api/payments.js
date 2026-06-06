import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { invoiceId } = req.query || {};
    let rows;
    if (invoiceId) {
      rows = await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE user_id = ${user.userId} AND invoice_id = ${Number(invoiceId)} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
    }
    const data = rows.map(r => ({
      id: r.id,
      invoiceId: r.invoice_id,
      amount: r.amount,
      currency: r.currency,
      method: r.method,
      note: r.note,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { invoiceId, amount, currency = 'NGN', method, note } = req.body || {};
    if (!invoiceId || !amount) { badRequest(res, 'invoiceId and amount are required'); return; }
    const [row] = await sql`
      INSERT INTO payments (user_id, invoice_id, amount, currency, method, note)
      VALUES (${user.userId}, ${Number(invoiceId)}, ${Number(amount)}, ${currency}, ${method || null}, ${note || null})
      RETURNING id, invoice_id, amount, currency, method, note, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, invoiceId: row.invoice_id, amount: row.amount, currency: row.currency, method: row.method, note: row.note, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
