import { sendJson, handleCors } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

const SECRET_HASH = process.env.FLUTTERWAVE_SECRET_HASH || '';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const signature = req.headers['verif-hash'];
    if (SECRET_HASH && signature !== SECRET_HASH) {
      sendJson(res, 401, { error: 'Invalid signature' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = body?.event;
    const data = body?.data || {};

    if (event === 'charge.completed') {
      const txRef = data.tx_ref || '';
      const status = data.status;
      const meta = data.meta || {};

      if (status !== 'successful') {
        sendJson(res, 200, { message: 'Payment not successful, ignoring' });
        return;
      }

      const tenantId = meta.tenant_id ? Number(meta.tenant_id) : null;
      const planSlug = meta.plan_slug || null;
      const interval = meta.interval || 'monthly';

      if (!tenantId || !planSlug) {
        const [tenant] = await sql`SELECT id FROM tenants WHERE flutterwave_tx_ref = ${txRef}`;
        if (!tenant) {
          sendJson(res, 200, { message: 'No matching tenant' });
          return;
        }
        const [existing] = await sql`SELECT plan, subscription_interval FROM tenants WHERE id = ${tenant.id}`;
        await sql`
          UPDATE tenants SET
            subscription_status = 'active',
            subscription_current_period_end = ${new Date(Date.now() + (interval === 'yearly' ? 365 : 30) * 86400000).toISOString()}
          WHERE id = ${tenant.id}
        `;
        sendJson(res, 200, { received: true });
        return;
      }

      const subscriptionId = data.id || null;
      const periodEnd = new Date(Date.now() + (interval === 'yearly' ? 365 : 30) * 86400000).toISOString();

      await sql`
        UPDATE tenants SET
          plan = ${planSlug},
          subscription_status = 'active',
          subscription_interval = ${interval},
          flutterwave_subscription_id = ${String(subscriptionId)},
          subscription_current_period_end = ${periodEnd},
          flutterwave_tx_ref = NULL
        WHERE id = ${tenantId}
      `;

      sendJson(res, 200, { received: true });
      return;
    }

    if (event === 'subscription.cancelled') {
      const subscriptionId = String(data.id || '');
      const [tenant] = await sql`SELECT id FROM tenants WHERE flutterwave_subscription_id = ${subscriptionId}`;
      if (!tenant) {
        sendJson(res, 200, { message: 'No matching tenant' });
        return;
      }
      await sql`
        UPDATE tenants SET
          subscription_status = 'canceled',
          flutterwave_subscription_id = NULL
        WHERE id = ${tenant.id}
      `;
      sendJson(res, 200, { received: true });
      return;
    }

    if (event === 'subscription.failed') {
      const subscriptionId = String(data.id || '');
      const [tenant] = await sql`SELECT id FROM tenants WHERE flutterwave_subscription_id = ${subscriptionId}`;
      if (!tenant) {
        sendJson(res, 200, { message: 'No matching tenant' });
        return;
      }
      await sql`
        UPDATE tenants SET
          subscription_status = 'past_due'
        WHERE id = ${tenant.id}
      `;
      sendJson(res, 200, { received: true });
      return;
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    console.error('[webhooks/flutterwave-sub] error:', err);
    sendJson(res, 200, { received: true, error: err.message });
  }
}
