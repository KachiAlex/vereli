import { sendJson, handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isStripeConfigured, createBillingPortalSession } from '../lib/stripeBilling.js';

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

  try {
    const [tenant] = await sql`SELECT id, stripe_customer_id FROM tenants WHERE id = ${tenantId}`;
    if (!tenant || !tenant.stripe_customer_id) {
      sendJson(res, 400, { error: 'No billing account found. Subscribe to a plan first.' });
      return;
    }

    const base = req.headers.origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || 'https://vereli.vercel.app';
    const session = await createBillingPortalSession({
      customerId: tenant.stripe_customer_id,
      returnUrl: `${base}/app?billing=portal`,
    });

    sendJson(res, 200, { data: { url: session.url } });
  } catch (err) {
    console.error('[billing/portal] error:', err);
    sendJson(res, 500, { error: err.message || 'Failed to create billing portal session' });
  }
}
