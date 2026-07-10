import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isPaystackConfigured, getPaystackPublicKey, generateTxRef, verifyTransaction } from '../lib/paystack.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!isPaystackConfigured()) {
    sendJson(res, 503, { error: 'Paystack is not configured' });
    return;
  }

  // Initialize payment
  if (req.method === 'POST' && !req.query.verify) {
    const { invoiceId, clientEmail, clientName } = req.body || {};
    if (!invoiceId) { badRequest(res, 'invoiceId is required'); return; }

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const [invoice] = await sql`
        SELECT i.id, i.amount, i.currency, i.status, i.client_id, c.email AS client_email, c.name AS client_name
        FROM invoices i
        JOIN clients c ON c.id = i.client_id
        WHERE i.id = ${Number(invoiceId)} AND i.tenant_id = ${user.tenantId}
      `;
      if (!invoice) { sendJson(res, 404, { error: 'Invoice not found' }); return; }
      if (invoice.status === 'paid') { sendJson(res, 400, { error: 'Invoice already paid' }); return; }

      const txRef = generateTxRef('VRL');
      const amount = invoice.amount; // stored in kobo/cents
      const currency = (invoice.currency || 'NGN').toUpperCase();
      const customerEmail = clientEmail || invoice.client_email;
      const customerName = clientName || invoice.client_name;

      await sql`
        INSERT INTO payments (tenant_id, user_id, invoice_id, amount, currency, method, gateway, status, paystack_tx_ref)
        VALUES (${user.tenantId}, ${user.userId}, ${invoice.id}, ${invoice.amount}, ${invoice.currency}, 'paystack', 'paystack', 'pending', ${txRef})
      `;

      sendJson(res, 200, {
        data: {
          txRef,
          publicKey: getPaystackPublicKey(),
          amount,
          currency,
          customerEmail,
          customerName,
          invoiceId: invoice.id,
        }
      });
    } catch (err) {
      console.error('[paystack/init] error:', err);
      sendJson(res, 500, { error: err.message || 'Failed to initialize payment' });
    }
    return;
  }

  // Verify payment
  if (req.method === 'POST' && req.query.verify) {
    const { reference, txRef } = req.body || {};
    if (!reference || !txRef) { badRequest(res, 'reference and txRef are required'); return; }

    try {
      const [payment] = await sql`SELECT * FROM payments WHERE paystack_tx_ref = ${txRef}`;
      if (!payment) { sendJson(res, 404, { error: 'Payment record not found' }); return; }

      const verify = await verifyTransaction(reference);
      if (!verify.ok || verify.data?.data?.status !== 'success') {
        console.warn('[paystack/verify] verification failed:', verify.data);
        sendJson(res, 400, { error: 'Payment verification failed', details: verify.data?.message || 'Unknown' });
        return;
      }

      const charged = verify.data.data;
      const chargedAmount = charged.amount;
      const expectedAmount = payment.amount;

      if (Math.abs(chargedAmount - expectedAmount) > 1) {
        sendJson(res, 400, { error: 'Payment amount mismatch' });
        return;
      }

      await sql`UPDATE payments SET status = 'completed', paystack_transaction_id = ${reference}, method = 'paystack' WHERE id = ${payment.id}`;
      await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${payment.invoice_id}`;

      sendJson(res, 200, { data: { status: 'paid', invoiceId: payment.invoice_id, reference } });
    } catch (err) {
      console.error('[paystack/verify] error:', err);
      sendJson(res, 500, { error: err.message || 'Failed to verify payment' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
