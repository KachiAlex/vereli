import { sendJson, handleCors, badRequest, requireAuth } from '../../lib/utils.js';
import { sql } from '../../lib/neon.js';
import { canManageData } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  if (req.method !== 'POST') { badRequest(res, 'Method not allowed'); return; }

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'Contract id required'); return; }

  const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  const [contract] = await sql`SELECT id, status FROM contracts WHERE id = ${id} AND tenant_id = ${tid}`;
  if (!contract) { sendJson(res, 404, { error: 'Contract not found' }); return; }
  if (contract.status !== 'draft') { sendJson(res, 400, { error: 'Only draft contracts can be sent' }); return; }

  const [row] = await sql`
    UPDATE contracts
    SET status = 'sent', sent_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
    RETURNING *, (SELECT name FROM clients WHERE id = contracts.client_id) AS client_name, (SELECT email FROM clients WHERE id = contracts.client_id) AS client_email
  `;

  sendJson(res, 200, { data: {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    content: row.content,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientName: row.client_name,
    clientEmail: row.client_email
  }});
}
