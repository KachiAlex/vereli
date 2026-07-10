import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { requireClientAuth } from './auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const client = await requireClientAuth(req, res);
  if (!client) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const clientId = client.clientId;

  if (req.method === 'GET') {
    const { id } = req.query || {};
    if (id) {
      const [row] = await sql`
        SELECT c.id, c.client_id, c.title, c.content, c.status, c.sender_name, c.signed_by, c.signature_type, c.signed_at, c.signed_ip, c.sent_at, c.viewed_at, c.pdf_url, c.created_at, c.updated_at,
          cl.name AS client_name, cl.email AS client_email, t.name AS tenant_name
        FROM contracts c
        JOIN clients cl ON cl.id = c.client_id
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = ${Number(id)} AND c.client_id = ${clientId}
      `;
      if (!row) { sendJson(res, 404, { error: 'Contract not found' }); return; }
      sendJson(res, 200, { data: mapRow(row) });
    } else {
      const rows = await sql`
        SELECT c.id, c.client_id, c.title, c.content, c.status, c.sender_name, c.signed_by, c.signature_type, c.signed_at, c.signed_ip, c.sent_at, c.viewed_at, c.pdf_url, c.created_at, c.updated_at,
          cl.name AS client_name, cl.email AS client_email, t.name AS tenant_name
        FROM contracts c
        JOIN clients cl ON cl.id = c.client_id
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.client_id = ${clientId}
        ORDER BY c.created_at DESC
      `;
      sendJson(res, 200, { data: rows.map(mapRow) });
    }
    return;
  }

  if (req.method === 'POST') {
    // Client marking contract as viewed
    const { id } = req.query || {};
    if (!id) { badRequest(res, 'id is required'); return; }

    const [contract] = await sql`SELECT id, status FROM contracts WHERE id = ${Number(id)} AND client_id = ${clientId}`;
    if (!contract) { sendJson(res, 404, { error: 'Contract not found' }); return; }

    if (contract.status === 'sent') {
      await sql`UPDATE contracts SET status = 'viewed', viewed_at = NOW(), updated_at = NOW() WHERE id = ${contract.id}`;
    }

    const [row] = await sql`
      SELECT c.*, cl.name AS client_name, cl.email AS client_email, t.name AS tenant_name
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.id = ${contract.id}
    `;
    sendJson(res, 200, { data: mapRow(row) });
    return;
  }

  badRequest(res, 'Method not allowed');
}

function mapRow(r) {
  return {
    id: r.id,
    clientId: r.client_id,
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
    clientEmail: r.client_email,
    tenantName: r.tenant_name
  };
}
