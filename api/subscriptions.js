import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

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
    const rows = await sql`SELECT id, client_id, name, amount, currency, interval, status, stripe_subscription_id, start_date, end_date, next_billing_date, created_at FROM subscriptions WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
    sendJson(res, 200, { data: rows.map(r => ({ id: r.id, clientId: r.client_id, name: r.name, amount: r.amount, currency: r.currency, interval: r.interval, status: r.status, stripeSubscriptionId: r.stripe_subscription_id, startDate: r.start_date, endDate: r.end_date, nextBillingDate: r.next_billing_date, createdAt: r.created_at })) });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const { clientId, name, amount, currency = 'usd', interval = 'month', startDate } = req.body || {};
    if (!clientId || !name || !amount) { badRequest(res, 'clientId, name, and amount are required'); return; }

    const [client] = await sql`SELECT id FROM clients WHERE id = ${Number(clientId)} AND tenant_id = ${tenantId}`;
    if (!client) { sendJson(res, 404, { error: 'Client not found' }); return; }

    // Create Stripe subscription if key is configured
    let stripeSubId = null;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const product = await stripe.products.create({ name: `${name} — ${interval}` });
        const price = await stripe.prices.create({ unit_amount: Math.round(amount * 100), currency: currency.toLowerCase(), recurring: { interval }, product: product.id });
        const subscription = await stripe.subscriptions.create({ customer: 'cus_placeholder', items: [{ price: price.id }], payment_behavior: 'default_incomplete', expand: ['latest_invoice.payment_intent'] });
        stripeSubId = subscription.id;
      } catch (err) { console.error('Stripe subscription error:', err); }
    }

    const [row] = await sql`
      INSERT INTO subscriptions (tenant_id, client_id, name, amount, currency, interval, status, stripe_subscription_id, start_date, next_billing_date)
      VALUES (${tenantId}, ${Number(clientId)}, ${name}, ${amount}, ${currency}, ${interval}, 'active', ${stripeSubId}, ${startDate || new Date().toISOString()}, ${startDate ? new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()})
      RETURNING id, client_id, name, amount, currency, interval, status, stripe_subscription_id, start_date, next_billing_date, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, clientId: row.client_id, name: row.name, amount: row.amount, currency: row.currency, interval: row.interval, status: row.status, stripeSubscriptionId: row.stripe_subscription_id, startDate: row.start_date, nextBillingDate: row.next_billing_date, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
