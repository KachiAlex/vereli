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

  if (req.method === 'GET') {
    const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
    const { clientId } = req.query || {};
    let rows;
    if (clientId) {
      rows = await sql`
        SELECT c.id, c.client_id, c.user_id, c.title, c.content, c.status, c.sender_name, c.signed_by, c.signature_type, c.signed_at, c.signed_ip, c.sent_at, c.viewed_at, c.pdf_url, c.created_at, c.updated_at,
          cl.name AS client_name, cl.email AS client_email
        FROM contracts c
        JOIN clients cl ON cl.id = c.client_id
        WHERE c.tenant_id = ${tid} AND c.client_id = ${Number(clientId)}
        ORDER BY c.created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT c.id, c.client_id, c.user_id, c.title, c.content, c.status, c.sender_name, c.signed_by, c.signature_type, c.signed_at, c.signed_ip, c.sent_at, c.viewed_at, c.pdf_url, c.created_at, c.updated_at,
          cl.name AS client_name, cl.email AS client_email
        FROM contracts c
        JOIN clients cl ON cl.id = c.client_id
        WHERE c.tenant_id = ${tid}
        ORDER BY c.created_at DESC
      `;
    }
    sendJson(res, 200, { data: rows.map(mapRow) });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const { clientId, title, content } = req.body || {};
    if (!clientId || !title) { badRequest(res, 'clientId and title are required'); return; }

    const [client] = await sql`SELECT id FROM clients WHERE id = ${Number(clientId)} AND tenant_id = ${tenantId}`;
    if (!client) { sendJson(res, 404, { error: 'Client not found' }); return; }

    const [row] = await sql`
      INSERT INTO contracts (tenant_id, client_id, user_id, title, content, status, sender_name)
      VALUES (${tenantId}, ${Number(clientId)}, ${user.userId}, ${title}, ${content || ''}, 'draft', ${user.name || ''})
      RETURNING id, client_id, user_id, title, content, status, sender_name, signed_by, signature_type, signed_at, signed_ip, sent_at, viewed_at, pdf_url, created_at, updated_at
    `;
    sendJson(res, 201, { data: mapRow(row) });
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
