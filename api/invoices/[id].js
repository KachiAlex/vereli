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
      ? await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE id = ${id}`
      : await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, projectId: row.project_id, amount: row.amount, currency: row.currency, status: row.status, dueDate: row.due_date, lineItems: row.line_items || [], sentAt: row.sent_at, paidAt: row.paid_at, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { amount, currency, status, due_date, lineItems, sentAt, paidAt } = req.body || {};
    const fields = [];
    const values = [];
    if (amount !== undefined) { fields.push('amount = $' + (fields.length + 1)); values.push(Number(amount)); }
    if (currency !== undefined) { fields.push('currency = $' + (fields.length + 1)); values.push(currency); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (due_date !== undefined) { fields.push('due_date = $' + (fields.length + 1)); values.push(due_date); }
    if (lineItems !== undefined) { fields.push('line_items = $' + (fields.length + 1)); values.push(JSON.stringify(lineItems)); }
    if (sentAt !== undefined) { fields.push('sent_at = $' + (fields.length + 1)); values.push(sentAt || null); }
    if (paidAt !== undefined) { fields.push('paid_at = $' + (fields.length + 1)); values.push(paidAt || null); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = user.role === 'superadmin'
      ? `UPDATE invoices SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at`
      : `UPDATE invoices SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, projectId: row.project_id, amount: row.amount, currency: row.currency, status: row.status, dueDate: row.due_date, lineItems: row.line_items || [], sentAt: row.sent_at, paidAt: row.paid_at, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'POST' && req.query.action === 'mark-paid') {
    const [row] = user.role === 'superadmin'
      ? await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${id} RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at`
      : await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, projectId: row.project_id, amount: row.amount, currency: row.currency, status: row.status, dueDate: row.due_date, lineItems: row.line_items || [], sentAt: row.sent_at, paidAt: row.paid_at, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'POST' && req.query.action === 'mark-sent') {
    const [row] = user.role === 'superadmin'
      ? await sql`UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = ${id} RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at`
      : await sql`UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, projectId: row.project_id, amount: row.amount, currency: row.currency, status: row.status, dueDate: row.due_date, lineItems: row.line_items || [], sentAt: row.sent_at, paidAt: row.paid_at, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM invoices WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM invoices WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Invoice deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
