import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  await sql`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      remind_at TIMESTAMPTZ NOT NULL,
      sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  if (req.method === 'GET') {
    try {
      const upcoming = await sql`
        SELECT id, title, entity_type, entity_id, remind_at, sent FROM reminders 
        WHERE tenant_id = ${targetTenantId} AND (user_id = ${user.userId} OR ${user.role === 'admin' || user.role === 'superadmin'}) AND remind_at >= NOW() AND sent = false
        ORDER BY remind_at ASC
        LIMIT 50
      `;
      const data = upcoming.map(r => ({
        id: r.id,
        title: r.title,
        entityType: r.entity_type,
        entityId: r.entity_id,
        remindAt: r.remind_at,
        sent: r.sent,
      }));
      sendJson(res, 200, { data });
    } catch (err) {
      console.error('Reminders error:', err);
      sendJson(res, 500, { error: 'Failed to fetch reminders' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { title, entityType, entityId, remindAt } = req.body || {};
    if (!title || !remindAt) {
      badRequest(res, 'title and remindAt are required');
      return;
    }

    try {
      const [row] = await sql`
        INSERT INTO reminders (tenant_id, user_id, title, entity_type, entity_id, remind_at)
        VALUES (${targetTenantId}, ${user.userId}, ${title}, ${entityType || null}, ${entityId || null}, ${remindAt})
        RETURNING id, title, entity_type, entity_id, remind_at, sent;
      `;
      sendJson(res, 201, { data: { id: row.id, title: row.title, entityType: row.entity_type, entityId: row.entity_id, remindAt: row.remind_at, sent: row.sent } });
    } catch (err) {
      console.error('Reminder create error:', err);
      sendJson(res, 500, { error: 'Failed to create reminder' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) { badRequest(res, 'id is required'); return; }

    try {
      const [row] = await sql`DELETE FROM reminders WHERE id = ${Number(id)} AND tenant_id = ${targetTenantId} RETURNING id`;
      if (!row) { sendJson(res, 404, { error: 'Not found' }); return; }
      sendJson(res, 200, { message: 'Reminder deleted' });
    } catch (err) {
      console.error('Reminder delete error:', err);
      sendJson(res, 500, { error: 'Failed to delete reminder' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
