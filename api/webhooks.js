import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageTenant } from './lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  await sql`
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT '{}',
      secret TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT id, url, events, secret, active, created_at FROM webhooks WHERE tenant_id = ${targetTenantId} ORDER BY created_at DESC`;
      const data = rows.map(r => ({ id: r.id, url: r.url, events: r.events, secret: r.secret ? '***' : null, active: r.active, createdAt: r.created_at }));
      sendJson(res, 200, { data });
    } catch (err) {
      console.error('Webhook fetch error:', err);
      sendJson(res, 500, { error: 'Failed to fetch webhooks' });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!canManageTenant(user)) {
      sendJson(res, 403, { error: 'Only admins can manage webhooks' });
      return;
    }

    const { url: hookUrl, events, secret } = req.body || {};
    if (!hookUrl || !events || !events.length) {
      badRequest(res, 'url and events are required');
      return;
    }

    try {
      const [row] = await sql`
        INSERT INTO webhooks (tenant_id, url, events, secret)
        VALUES (${targetTenantId}, ${hookUrl}, ${events}, ${secret || null})
        RETURNING id, url, events, active, created_at;
      `;
      sendJson(res, 201, { data: { id: row.id, url: row.url, events: row.events, active: row.active, createdAt: row.created_at } });
    } catch (err) {
      console.error('Webhook create error:', err);
      sendJson(res, 500, { error: 'Failed to create webhook' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    if (!canManageTenant(user)) {
      sendJson(res, 403, { error: 'Only admins can manage webhooks' });
      return;
    }

    const { id } = req.query || {};
    if (!id) { badRequest(res, 'id is required'); return; }

    try {
      const [row] = await sql`DELETE FROM webhooks WHERE id = ${Number(id)} AND tenant_id = ${targetTenantId} RETURNING id`;
      if (!row) { sendJson(res, 404, { error: 'Not found' }); return; }
      sendJson(res, 200, { message: 'Webhook deleted' });
    } catch (err) {
      console.error('Webhook delete error:', err);
      sendJson(res, 500, { error: 'Failed to delete webhook' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
