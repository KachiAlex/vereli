import { sendJson, handleCors } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

    if (endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } else {
      event = JSON.parse(rawBody);
    }
  } catch (err) {
    console.error('[webhooks/stripe] body/error:', err.message);
    sendJson(res, 400, { error: 'Invalid payload' });
    return;
  }

  const data = event.data?.object || {};
  const metadata = data.metadata || data.subscription_data?.metadata || {};
  const tenantId = metadata.tenant_id ? Number(metadata.tenant_id) : null;

  try {
    if (event.type === 'checkout.session.completed') {
      if (!tenantId) {
        sendJson(res, 200, { message: 'No tenant metadata' });
        return;
      }
      const subscription = await stripe.subscriptions.retrieve(data.subscription, { expand: ['items.price'] });
      const interval = subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
      const planSlug = metadata.plan_slug || 'starter';
      const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

      await sql`
        UPDATE tenants SET
          plan = ${planSlug},
          subscription_status = 'active',
          subscription_interval = ${interval},
          stripe_subscription_id = ${subscription.id},
          subscription_current_period_end = ${currentPeriodEnd}
        WHERE id = ${tenantId}
      `;
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subId = data.id;
      const [tenant] = await sql`SELECT id FROM tenants WHERE stripe_subscription_id = ${subId}`;
      if (!tenant) { sendJson(res, 200, { message: 'No matching tenant' }); return; }

      const status = data.status === 'active' || data.status === 'trialing' ? data.status : 'past_due';
      const currentPeriodEnd = data.current_period_end ? new Date(data.current_period_end * 1000).toISOString() : null;
      await sql`
        UPDATE tenants SET
          subscription_status = ${status},
          subscription_current_period_end = ${currentPeriodEnd}
        WHERE id = ${tenant.id}
      `;
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    console.error('[webhooks/stripe] error:', err);
    sendJson(res, 200, { received: true, error: err.message });
  }
}
