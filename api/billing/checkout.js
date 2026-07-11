import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isFlutterwaveConfigured, getFlutterwavePublicKey, getOrCreatePaymentPlan, initializeSubscriptionPayment, generateTxRef as fwTxRef } from '../lib/flutterwaveBilling.js';
import { isPaystackConfigured, getPaystackPublicKey, initializeTransaction as psInit, generateTxRef as psTxRef } from '../lib/paystack.js';
import { isStripeConfigured, getOrCreateCustomer, createCheckoutSession } from '../lib/stripeBilling.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

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

  const { planSlug, interval, gateway, successUrl } = req.body || {};
  if (!planSlug || !interval) {
    badRequest(res, 'planSlug and interval are required');
    return;
  }
  if (!['monthly', 'yearly'].includes(interval)) {
    badRequest(res, 'interval must be monthly or yearly');
    return;
  }

  const gw = gateway || 'flutterwave';

  try {
    const [tenant] = await sql`SELECT id, name, plan, email, settings, stripe_customer_id, flutterwave_subscription_id FROM tenants WHERE id = ${tenantId}`;
    if (!tenant) { sendJson(res, 404, { error: 'Tenant not found' }); return; }

    const [plan] = await sql`
      SELECT id, name, slug, description, price_monthly, price_yearly, currency,
             user_limit, client_limit, features, active
      FROM plans WHERE slug = ${planSlug} AND active = true
    `;
    if (!plan) { sendJson(res, 404, { error: 'Plan not found' }); return; }

    const amount = interval === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const currency = (plan.currency || 'NGN').toUpperCase();

    if (amount === 0) {
      sendJson(res, 400, { error: 'Enterprise plan requires contacting sales' });
      return;
    }

    const origin = req.headers.origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || 'https://vereli.vercel.app';
    const base = successUrl || origin;

    const [userRow] = await sql`SELECT email, name FROM users WHERE id = ${user.userId}`;
    const customerEmail = userRow?.email || tenant.email || '';
    const customerName = userRow?.name || tenant.name || '';

    if (gw === 'flutterwave') {
      if (!isFlutterwaveConfigured()) {
        sendJson(res, 503, { error: 'Flutterwave is not configured' });
        return;
      }

      const paymentPlan = await getOrCreatePaymentPlan({
        planSlug: plan.slug,
        planName: plan.name,
        amount,
        interval,
        currency,
      });

      const redirectUrl = `${base}/app?billing=success`;
      const txRef = fwTxRef();

      const initRes = await initializeSubscriptionPayment({
        txRef,
        amount,
        currency,
        customerEmail,
        customerName,
        paymentPlanId: paymentPlan.id,
        redirectUrl,
        meta: { tenant_id: String(tenantId), plan_slug: plan.slug, interval },
      });

      if (!initRes.ok) {
        sendJson(res, 500, { error: initRes.data?.message || 'Failed to initialize payment' });
        return;
      }

      await sql`
        UPDATE tenants SET
          flutterwave_payment_plan_id = ${paymentPlan.id},
          flutterwave_tx_ref = ${txRef},
          subscription_interval = ${interval}
        WHERE id = ${tenantId}
      `;

      sendJson(res, 200, {
        data: {
          gateway: 'flutterwave',
          publicKey: getFlutterwavePublicKey(),
          txRef,
          amount,
          currency,
          customerEmail,
          customerName,
          paymentPlanId: paymentPlan.id,
          redirectUrl,
        },
      });
    } else if (gw === 'paystack') {
      if (!isPaystackConfigured()) {
        sendJson(res, 503, { error: 'Paystack is not configured' });
        return;
      }

      const redirectUrl = `${base}/app?billing=success`;
      const txRef = psTxRef('VSUB');

      const initRes = await psInit({
        reference: txRef,
        amount,
        currency,
        email: customerEmail,
        name: customerName,
        callbackUrl: redirectUrl,
        metadata: { tenant_id: String(tenantId), plan_slug: plan.slug, interval, type: 'subscription' },
      });

      if (!initRes.ok) {
        sendJson(res, 500, { error: initRes.data?.message || 'Failed to initialize payment' });
        return;
      }

      await sql`
        UPDATE tenants SET
          flutterwave_tx_ref = ${txRef},
          subscription_interval = ${interval}
        WHERE id = ${tenantId}
      `;

      sendJson(res, 200, {
        data: {
          gateway: 'paystack',
          publicKey: getPaystackPublicKey(),
          txRef,
          amount,
          currency,
          customerEmail,
          customerName,
          authorizationUrl: initRes.data?.data?.authorization_url,
          redirectUrl,
        },
      });
    } else if (gw === 'stripe') {
      if (!isStripeConfigured()) {
        sendJson(res, 503, { error: 'Stripe is not configured' });
        return;
      }

      const customerId = await getOrCreateCustomer(tenant);
      if (!tenant.stripe_customer_id) {
        await sql`UPDATE tenants SET stripe_customer_id = ${customerId} WHERE id = ${tenantId}`;
      }

      const session = await createCheckoutSession({
        customerId,
        plan,
        interval,
        tenantId,
        successUrl: `${base}/app?billing=success`,
        cancelUrl: `${base}/app?billing=cancel`,
      });

      sendJson(res, 200, {
        data: {
          gateway: 'stripe',
          url: session.url,
          sessionId: session.id,
        },
      });
    } else {
      badRequest(res, 'Invalid gateway. Use flutterwave, paystack, or stripe.');
    }
  } catch (err) {
    console.error('[billing/checkout] error:', err);
    sendJson(res, 500, { error: err.message || 'Failed to create checkout' });
  }
}
