import { sendJson, handleCors } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { verifyTransaction } from '../lib/paystack.js';

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const rawBody = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  let event;
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch (err) {
    console.error('[webhooks/paystack] invalid json:', err.message);
    sendJson(res, 400, { error: 'Invalid payload' });
    return;
  }

  if (event.event !== 'charge.success') {
    sendJson(res, 200, { message: 'Ignored' });
    return;
  }

  const data = event.data || {};
  const reference = data.reference;
  if (!reference) {
    sendJson(res, 400, { error: 'Missing reference' });
    return;
  }

  try {
    const [payment] = await sql`SELECT * FROM payments WHERE paystack_tx_ref = ${reference}`;
    if (!payment) {
      sendJson(res, 200, { message: 'No matching payment' });
      return;
    }

    const verify = await verifyTransaction(reference);
    if (!verify.ok || verify.data?.data?.status !== 'success') {
      console.warn('[webhooks/paystack] verification failed:', verify.data);
      sendJson(res, 400, { error: 'Verification failed' });
      return;
    }

    const charged = verify.data.data;
    const chargedAmount = charged.amount;
    const expectedAmount = payment.amount;

    if (Math.abs(chargedAmount - expectedAmount) > 1) {
      sendJson(res, 400, { error: 'Payment amount mismatch' });
      return;
    }

    if (payment.status !== 'completed') {
      await sql`UPDATE payments SET status = 'completed', paystack_transaction_id = ${reference}, method = 'paystack' WHERE id = ${payment.id}`;
      await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${payment.invoice_id}`;
    }

    sendJson(res, 200, { message: 'Processed' });
  } catch (err) {
    console.error('[webhooks/paystack] error:', err);
    sendJson(res, 500, { error: 'Failed to process webhook' });
  }
}
