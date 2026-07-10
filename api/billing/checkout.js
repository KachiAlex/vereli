import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isStripeConfigured, getOrCreateCustomer, createCheckoutSession } from '../lib/stripeBilling.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!isStripeConfigured()) {
    sendJson(res, 503, { error: 'Stripe is not configured' });
    return;
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const tenantId = user.tenantId;
  if (!tenantId) {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  const { planSlug, interval, successUrl, cancelUrl } = req.body || {};
  if (!planSlug || !interval) {
    badRequest(res, 'planSlug and interval are required');
    return;
  }
  if (!['monthly', 'yearly'].includes(interval)) {
    badRequest(res, 'interval must be monthly or yearly');
    return;
  }

  try {
    const [tenant] = await sql`SELECT id, name, plan, stripe_customer_id FROM tenants WHERE id = ${tenantId}`;
    if (!tenant) { sendJson(res, 404, { error: 'Tenant not found' }); return; }

    const [plan] = await sql`
      SELECT id, name, slug, description, price_monthly, price_yearly, currency,
             user_limit, client_limit, features, active
      FROM plans WHERE slug = ${planSlug} AND active = true
    `;
    if (!plan) { sendJson(res, 404, { error: 'Plan not found' }); return; }

    const customerId = await getOrCreateCustomer(tenant);
    if (!tenant.stripe_customer_id) {
      await sql`UPDATE tenants SET stripe_customer_id = ${customerId} WHERE id = ${tenantId}`;
    }

    const origin = req.headers.origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || 'https://vereli.vercel.app';
    const base = successUrl || origin;
    const session = await createCheckoutSession({
      customerId,
      plan,
      interval,
      tenantId,
      successUrl: `${base}/app?billing=success`,
      cancelUrl: `${base}/app?billing=cancel`,
    });

    sendJson(res, 200, { data: { url: session.url, sessionId: session.id } });
  } catch (err) {
    console.error('[billing/checkout] error:', err);
    sendJson(res, 500, { error: err.message || 'Failed to create checkout session' });
  }
}
