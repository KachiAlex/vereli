import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // Create payment intent for an invoice
  if (req.method === 'POST') {
    const { invoiceId, amount, currency = 'usd', clientEmail } = req.body || {};
    if (!invoiceId || !amount) { badRequest(res, 'invoiceId and amount are required'); return; }

    // Verify invoice exists and belongs to tenant
    const [invoice] = await sql`SELECT id, invoice_number, amount, status, client_id FROM invoices WHERE id = ${Number(invoiceId)} AND tenant_id = ${user.tenantId}`;
    if (!invoice) { sendJson(res, 404, { error: 'Invoice not found' }); return; }
    if (invoice.status === 'paid') { sendJson(res, 400, { error: 'Invoice already paid' }); return; }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // cents
        currency: currency.toLowerCase(),
        metadata: { invoiceId: String(invoiceId), tenantId: String(user.tenantId) },
        receipt_email: clientEmail || undefined,
        automatic_payment_methods: { enabled: true },
      });

      // Store payment intent reference
      await sql`UPDATE invoices SET stripe_payment_intent_id = ${paymentIntent.id} WHERE id = ${Number(invoiceId)}`;

      sendJson(res, 200, { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
    } catch (err) {
      console.error('Stripe error:', err);
      sendJson(res, 500, { error: err.message || 'Payment initialization failed' });
    }
    return;
  }

  // Confirm payment and mark invoice paid
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { paymentIntentId, invoiceId } = req.body || {};
    if (!paymentIntentId || !invoiceId) { badRequest(res, 'paymentIntentId and invoiceId required'); return; }

    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status === 'succeeded') {
        await sql`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ${Number(invoiceId)}`;
        // Log payment record
        await sql`INSERT INTO payments (tenant_id, invoice_id, amount, currency, method, status, stripe_payment_intent_id, created_at) VALUES (${user.tenantId}, ${Number(invoiceId)}, ${intent.amount / 100}, ${intent.currency}, 'card', 'completed', ${paymentIntentId}, NOW())`;
        sendJson(res, 200, { message: 'Payment confirmed', status: 'paid' });
      } else {
        sendJson(res, 400, { error: 'Payment not completed', status: intent.status });
      }
    } catch (err) {
      console.error('Stripe confirm error:', err);
      sendJson(res, 500, { error: err.message || 'Payment confirmation failed' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
