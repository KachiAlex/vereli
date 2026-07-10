import { sendJson, handleCors, badRequest } from '../../lib/utils.js';
import { sql } from '../../lib/neon.js';
import { requireClientAuth } from '../auth.js';
import { generateSignedContractPdf, uploadSignedPdf } from '../../lib/pdf.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const client = await requireClientAuth(req, res);
  if (!client) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (req.method !== 'POST') { badRequest(res, 'Method not allowed'); return; }

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'Contract id required'); return; }

  const { signedBy, signatureType, signatureData } = req.body || {};
  if (!signedBy || !signatureType || !signatureData) {
    badRequest(res, 'signedBy, signatureType, and signatureData are required');
    return;
  }

  const signedIp = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.socket?.remoteAddress || '';

  try {
    const [contract] = await sql`
      SELECT c.*, cl.name AS client_name, cl.email AS client_email, t.name AS tenant_name
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.id = ${id} AND c.client_id = ${client.clientId}
    `;

    if (!contract) { sendJson(res, 404, { error: 'Contract not found' }); return; }
    if (!['sent', 'viewed'].includes(contract.status)) {
      sendJson(res, 400, { error: 'Contract cannot be signed in current status' });
      return;
    }

    const [row] = await sql`
      UPDATE contracts
      SET status = 'signed',
          signed_by = ${signedBy},
          signature_type = ${signatureType},
          signature_data = ${signatureData},
          signed_at = NOW(),
          signed_ip = ${signedIp},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *, (SELECT name FROM clients WHERE id = contracts.client_id) AS client_name, (SELECT email FROM clients WHERE id = contracts.client_id) AS client_email, (SELECT name FROM tenants WHERE id = contracts.tenant_id) AS tenant_name
    `;

    let pdfUrl = '';
    try {
      const pdfBytes = await generateSignedContractPdf(row, row.tenant_name, row.client_name);
      pdfUrl = await uploadSignedPdf(row.tenant_id, row.id, pdfBytes, `${row.title}-signed.pdf`);
      await sql`UPDATE contracts SET pdf_url = ${pdfUrl} WHERE id = ${id}`;
    } catch (pdfErr) {
      console.error('[portal/contracts/sign] PDF generation failed:', pdfErr.message);
    }

    sendJson(res, 200, { data: {
      id: row.id,
      title: row.title,
      status: row.status,
      signedBy: row.signed_by,
      signatureType: row.signature_type,
      signedAt: row.signed_at,
      signedIp: row.signed_ip,
      pdfUrl: pdfUrl || row.pdf_url
    }});
  } catch (err) {
    console.error('[portal/contracts/sign] error:', err);
    sendJson(res, 500, { error: err.message || 'Failed to sign contract' });
  }
}
