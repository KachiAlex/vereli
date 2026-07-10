import { sendJson, handleCors, badRequest } from '../../lib/utils.js';
import { sql } from '../../lib/neon.js';
import { requireClientAuth } from '../auth.js';
import { isFlutterwaveConfigured, getFlutterwavePublicKey, generateTxRef } from '../../lib/flutterwave.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!isFlutterwaveConfigured()) {
    sendJson(res, 503, { error: 'Flutterwave is not configured' });
    return;
  }

  if (req.method === 'POST') {
    const { invoiceId } = req.body || {};
    if (!invoiceId) { badRequest(res, 'invoiceId is required'); return; }

    const client = await requireClientAuth(req, res);
    if (!client) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      const [invoice] = await sql`
        SELECT i.id, i.amount, i.currency, i.status, i.client_id, c.tenant_id
        FROM invoices i
        JOIN clients c ON c.id = i.client_id
        WHERE i.id = ${Number(invoiceId)} AND i.client_id = ${client.clientId}
      `;
      if (!invoice) { sendJson(res, 404, { error: 'Invoice not found' }); return; }
      if (invoice.status === 'paid') { sendJson(res, 400, { error: 'Invoice already paid' }); return; }

      const txRef = generateTxRef('VRL');
      const amount = invoice.amount / 100;
      const currency = (invoice.currency || 'NGN').toUpperCase();

      await sql`
        INSERT INTO payments (tenant_id, user_id, invoice_id, amount, currency, method, gateway, status, flutterwave_tx_ref)
        VALUES (${invoice.tenant_id}, null, ${invoice.id}, ${invoice.amount}, ${invoice.currency}, 'flutterwave', 'flutterwave', 'pending', ${txRef})
      `;

      sendJson(res, 200, {
        data: {
          txRef,
          publicKey: getFlutterwavePublicKey(),
          amount,
          currency,
          customerEmail: client.email,
          customerName: client.name,
          invoiceId: invoice.id,
        }
      });
    } catch (err) {
      console.error('[portal/flutterwave/init] error:', err);
      sendJson(res, 500, { error: err.message || 'Failed to initialize payment' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
