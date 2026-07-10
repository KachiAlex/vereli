import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isFlutterwaveConfigured, getFlutterwavePublicKey, generateTxRef, verifyTransaction } from '../lib/flutterwave.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!isFlutterwaveConfigured()) {
    sendJson(res, 503, { error: 'Flutterwave is not configured' });
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
      const amount = invoice.amount / 100; // stored in kobo/cents
      const currency = (invoice.currency || 'NGN').toUpperCase();
      const customerEmail = clientEmail || invoice.client_email;
      const customerName = clientName || invoice.client_name;

      await sql`
        INSERT INTO payments (tenant_id, user_id, invoice_id, amount, currency, method, gateway, status, flutterwave_tx_ref)
        VALUES (${user.tenantId}, ${user.userId}, ${invoice.id}, ${invoice.amount}, ${invoice.currency}, 'flutterwave', 'flutterwave', 'pending', ${txRef})
      `;

      sendJson(res, 200, {
        data: {
          txRef,
          publicKey: getFlutterwavePublicKey(),
          amount,
          currency,
          customerEmail,
          customerName,
          invoiceId: invoice.id,
        }
      });
    } catch (err) {
      console.error('[flutterwave/init] error:', err);
      sendJson(res, 500, { error: err.message || 'Failed to initialize payment' });
    }
    return;
  }

  // Verify payment
  if (req.method === 'POST' && req.query.verify) {
    // This endpoint can be called by authenticated users or from portal with client_token
    const { transactionId, txRef } = req.body || {};
    if (!transactionId || !txRef) { badRequest(res, 'transactionId and txRef are required'); return; }

    try {
      const [payment] = await sql`SELECT * FROM payments WHERE flutterwave_tx_ref = ${txRef}`;
      if (!payment) { sendJson(res, 404, { error: 'Payment record not found' }); return; }

      const verify = await verifyTransaction(transactionId);
      if (!verify.ok || verify.data?.status !== 'success' || verify.data?.data?.status !== 'successful') {
        console.warn('[flutterwave/verify] verification failed:', verify.data);
        sendJson(res, 400, { error: 'Payment verification failed', details: verify.data?.message || 'Unknown' });
        return;
      }

      const charged = verify.data.data;
      const chargedAmount = charged.charged_amount || charged.amount;
      const expectedAmount = payment.amount / 100;

      if (Math.abs(chargedAmount - expectedAmount) > 0.01) {
        sendJson(res, 400, { error: 'Payment amount mismatch' });
        return;
      }

      await sql`UPDATE payments SET status = 'completed', flutterwave_transaction_id = ${transactionId}, method = 'flutterwave' WHERE id = ${payment.id}`;
      await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${payment.invoice_id}`;

      sendJson(res, 200, { data: { status: 'paid', invoiceId: payment.invoice_id, transactionId } });
    } catch (err) {
      console.error('[flutterwave/verify] error:', err);
      sendJson(res, 500, { error: err.message || 'Failed to verify payment' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
