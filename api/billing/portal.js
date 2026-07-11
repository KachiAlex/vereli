import { sendJson, handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isFlutterwaveConfigured, cancelSubscription } from '../lib/flutterwaveBilling.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!isFlutterwaveConfigured()) {
    sendJson(res, 503, { error: 'Flutterwave is not configured' });
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
    const [tenant] = await sql`SELECT id, flutterwave_subscription_id FROM tenants WHERE id = ${tenantId}`;
    if (!tenant || !tenant.flutterwave_subscription_id) {
      sendJson(res, 400, { error: 'No active subscription found. Subscribe to a plan first.' });
      return;
    }

    const cancelRes = await cancelSubscription(tenant.flutterwave_subscription_id);
    if (!cancelRes.ok) {
      sendJson(res, 500, { error: cancelRes.data?.message || 'Failed to cancel subscription' });
      return;
    }

    await sql`
      UPDATE tenants SET
        subscription_status = 'canceled',
        flutterwave_subscription_id = NULL
      WHERE id = ${tenantId}
    `;

    sendJson(res, 200, { data: { canceled: true } });
  } catch (err) {
    console.error('[billing/portal] error:', err);
    sendJson(res, 500, { error: err.message || 'Failed to cancel subscription' });
  }
}
