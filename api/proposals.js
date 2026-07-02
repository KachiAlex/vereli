import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
    let rows;
    if (clientId) {
      rows = await sql`SELECT id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at FROM proposals WHERE tenant_id = ${tid} AND client_id = ${Number(clientId)} ORDER BY created_at DESC`;
    } else if (status) {
      rows = await sql`SELECT id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at FROM proposals WHERE tenant_id = ${tid} AND status = ${status} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT id, client_id, title, description, amount, currency, status, line_items, valid_until, accepted_at, created_at FROM proposals WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
    }
    sendJson(res, 200, { data: rows.map(r => ({ id: r.id, clientId: r.client_id, title: r.title, description: r.description, amount: r.amount, currency: r.currency, status: r.status, lineItems: r.line_items || [], validUntil: r.valid_until, acceptedAt: r.accepted_at, createdAt: r.created_at })) });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const { clientId, title, description, amount, currency = 'USD', lineItems = [], validUntil } = req.body || {};
    if (!clientId || !title || !amount) { badRequest(res, 'clientId, title, and amount are required'); return; }

    const [client] = await sql`SELECT id FROM clients WHERE id = ${Number(clientId)} AND tenant_id = ${tenantId}`;
    if (!client) { sendJson(res, 404, { error: 'Client not found' }); return; }

    const [row] = await sql`
      INSERT INTO proposals (tenant_id, client_id, title, description, amount, currency, status, line_items, valid_until)
      VALUES (${tenantId}, ${Number(clientId)}, ${title}, ${description || null}, ${amount}, ${currency}, 'draft', ${JSON.stringify(lineItems)}, ${validUntil || null})
      RETURNING id, client_id, title, description, amount, currency, status, line_items, valid_until, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, clientId: row.client_id, title: row.title, description: row.description, amount: row.amount, currency: row.currency, status: row.status, lineItems: row.line_items || [], validUntil: row.valid_until, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
