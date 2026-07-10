import { sendJson, handleCors } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isFlutterwaveConfigured, verifyTransaction } from '../lib/flutterwave.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!isFlutterwaveConfigured()) {
    sendJson(res, 503, { error: 'Flutterwave is not configured' });
    return;
  }

  const payload = req.body || {};
  const event = payload.event || '';
  const transactionId = payload.data?.id;
  const txRef = payload.data?.tx_ref;
  const status = payload.data?.status;

  if (event !== 'charge.completed' || status !== 'successful' || !transactionId || !txRef) {
    sendJson(res, 200, { message: 'Ignored' });
    return;
  }

  try {
    const [payment] = await sql`SELECT * FROM payments WHERE flutterwave_tx_ref = ${txRef}`;
    if (!payment || payment.status === 'completed') {
      sendJson(res, 200, { message: 'No action needed' });
      return;
    }

    const verify = await verifyTransaction(transactionId);
    if (!verify.ok || verify.data?.status !== 'success' || verify.data?.data?.status !== 'successful') {
      console.warn('[webhooks/flutterwave] verification failed:', verify.data);
      sendJson(res, 200, { message: 'Verification failed' });
      return;
    }

    const charged = verify.data.data;
    const chargedAmount = charged.charged_amount || charged.amount;
    const expectedAmount = payment.amount / 100;

    if (Math.abs(chargedAmount - expectedAmount) > 0.01) {
      sendJson(res, 200, { message: 'Amount mismatch' });
      return;
    }

    await sql`UPDATE payments SET status = 'completed', flutterwave_transaction_id = ${transactionId}, method = 'flutterwave' WHERE id = ${payment.id}`;
    await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${payment.invoice_id}`;

    sendJson(res, 200, { message: 'Payment processed' });
  } catch (err) {
    console.error('[webhooks/flutterwave] error:', err);
    sendJson(res, 200, { message: 'Error handled' });
  }
}
