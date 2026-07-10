import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { canManageData } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'Contract id required'); return; }

  const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  const [contract] = await sql`
    SELECT c.*, cl.name AS client_name, cl.email AS client_email
    FROM contracts c
    JOIN clients cl ON cl.id = c.client_id
    WHERE c.id = ${id} AND c.tenant_id = ${tid}
  `;

  if (!contract) { sendJson(res, 404, { error: 'Contract not found' }); return; }

  if (req.method === 'GET') {
    sendJson(res, 200, { data: mapRow(contract) });
    return;
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    if (contract.status !== 'draft') { sendJson(res, 400, { error: 'Only draft contracts can be edited' }); return; }

    const { title, content } = req.body || {};
    const [row] = await sql`
      UPDATE contracts
      SET title = ${title || contract.title},
          content = ${content !== undefined ? content : contract.content},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *, (SELECT name FROM clients WHERE id = contracts.client_id) AS client_name, (SELECT email FROM clients WHERE id = contracts.client_id) AS client_email
    `;
    sendJson(res, 200, { data: mapRow(row) });
    return;
  }

  if (req.method === 'DELETE') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    await sql`DELETE FROM contracts WHERE id = ${id}`;
    sendJson(res, 200, { message: 'Contract deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}

function mapRow(r) {
  return {
    id: r.id,
    clientId: r.client_id,
    userId: r.user_id,
    title: r.title,
    content: r.content,
    status: r.status,
    senderName: r.sender_name,
    signedBy: r.signed_by,
    signatureType: r.signature_type,
    signatureData: r.signature_data,
    signedAt: r.signed_at,
    signedIp: r.signed_ip,
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    pdfUrl: r.pdf_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    clientName: r.client_name,
    clientEmail: r.client_email
  };
}
