import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { canManageData } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  const tenantId = user.tenantId;

  if (req.method === 'GET') {
    const [row] = user.role === 'superadmin'
      ? await sql`SELECT id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at FROM proposals WHERE id = ${id}`
      : await sql`SELECT id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at FROM proposals WHERE id = ${id} AND tenant_id = ${tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, title: row.title, description: row.description, amount: row.amount, currency: row.currency, status: row.status, lineItems: row.line_items || [], validUntil: row.valid_until, acceptedAt: row.accepted_at, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const { title, description, amount, currency, status, lineItems, validUntil } = req.body || {};
    const fields = []; const values = [];
    if (title !== undefined) { fields.push('title = $' + (fields.length + 1)); values.push(title); }
    if (description !== undefined) { fields.push('description = $' + (fields.length + 1)); values.push(description); }
    if (amount !== undefined) { fields.push('amount = $' + (fields.length + 1)); values.push(amount); }
    if (currency !== undefined) { fields.push('currency = $' + (fields.length + 1)); values.push(currency); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (lineItems !== undefined) { fields.push('line_items = $' + (fields.length + 1)); values.push(JSON.stringify(lineItems)); }
    if (validUntil !== undefined) { fields.push('valid_until = $' + (fields.length + 1)); values.push(validUntil); }
    if (status === 'accepted') { fields.push('accepted_at = $' + (fields.length + 1)); values.push(new Date().toISOString()); }
    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }
    const query = user.role === 'superadmin'
      ? `UPDATE proposals SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at`
      : `UPDATE proposals SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { data: { id: row.id, clientId: row.client_id, title: row.title, description: row.description, amount: row.amount, currency: row.currency, status: row.status, lineItems: row.line_items || [], validUntil: row.valid_until, acceptedAt: row.accepted_at, createdAt: row.created_at } });
    return;
  }

  if (req.method === 'DELETE') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM proposals WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM proposals WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Proposal deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
