import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const tenantId = user.tenantId;
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_email TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        old_value JSONB,
        new_value JSONB,
        ip TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const rows = targetTenantId
      ? await sql`SELECT * FROM audit_log WHERE tenant_id = ${targetTenantId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const data = rows.map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      userEmail: r.user_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      oldValue: r.old_value,
      newValue: r.new_value,
      ip: r.ip,
      createdAt: r.created_at,
    }));

    sendJson(res, 200, { data });
  } catch (err) {
    console.error('Audit log fetch error:', err);
    sendJson(res, 500, { error: 'Failed to fetch audit log' });
  }
}
