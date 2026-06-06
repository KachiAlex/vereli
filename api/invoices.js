import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    const uid = user.userId;
    let rows;

    if (clientId && status) {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE user_id = ${uid} AND client_id = ${Number(clientId)} AND status = ${status}`;
    } else if (clientId) {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE user_id = ${uid} AND client_id = ${Number(clientId)}`;
    } else if (status) {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE user_id = ${uid} AND status = ${status}`;
    } else {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE user_id = ${uid}`;
    }

    const data = rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      projectId: r.project_id,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      dueDate: r.due_date,
      lineItems: r.line_items || [],
      sentAt: r.sent_at,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { clientId, projectId, amount, currency = 'NGN', dueDate, status = 'pending', lineItems } = req.body || {};
    if (!clientId || !projectId || !amount || !dueDate) {
      badRequest(res, 'clientId, projectId, amount, and dueDate are required');
      return;
    }
    const li = lineItems ? JSON.stringify(lineItems) : null;
    const [row] = await sql`
      INSERT INTO invoices (user_id, client_id, project_id, amount, currency, status, due_date, line_items)
      VALUES (${user.userId}, ${Number(clientId)}, ${Number(projectId)}, ${Number(amount)}, ${currency}, ${status}, ${dueDate}, ${li})
      RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at;
    `;
    const invoice = {
      id: row.id,
      clientId: row.client_id,
      projectId: row.project_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      dueDate: row.due_date,
      lineItems: row.line_items || [],
      sentAt: row.sent_at,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: invoice });
    return;
  }

  badRequest(res, 'Method not allowed');
}
