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
    const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
    const rows = await sql`SELECT id, name, trigger_event, conditions, actions, active, created_at FROM workflows WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
    sendJson(res, 200, { data: rows.map(r => ({ id: r.id, name: r.name, triggerEvent: r.trigger_event, conditions: r.conditions || {}, actions: r.actions || [], active: r.active, createdAt: r.created_at })) });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const { name, triggerEvent, conditions, actions } = req.body || {};
    if (!name || !triggerEvent || !actions) { badRequest(res, 'name, triggerEvent, and actions are required'); return; }

    const [row] = await sql`
      INSERT INTO workflows (tenant_id, name, trigger_event, conditions, actions, active)
      VALUES (${tenantId}, ${name}, ${triggerEvent}, ${JSON.stringify(conditions || {})}, ${JSON.stringify(actions)}, true)
      RETURNING id, name, trigger_event, conditions, actions, active, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, name: row.name, triggerEvent: row.trigger_event, conditions: row.conditions || {}, actions: row.actions || [], active: row.active, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
