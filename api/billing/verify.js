import { sendJson, handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isFlutterwaveConfigured, verifyTransaction as fwVerify } from '../lib/flutterwaveBilling.js';
import { isPaystackConfigured, verifyTransaction as psVerify } from '../lib/paystack.js';

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

  const { txRef, gateway } = req.body || {};
  if (!txRef) {
    sendJson(res, 400, { error: 'txRef is required' });
    return;
  }

  const gw = gateway || 'flutterwave';

  try {
    const [tenant] = await sql`SELECT id, flutterwave_tx_ref, subscription_interval FROM tenants WHERE id = ${tenantId}`;
    if (!tenant) {
      sendJson(res, 404, { error: 'Tenant not found' });
      return;
    }

    let txData, meta, subscriptionId;

    if (gw === 'flutterwave') {
      if (!isFlutterwaveConfigured()) {
        sendJson(res, 503, { error: 'Flutterwave is not configured' });
        return;
      }
      const verifyRes = await fwVerify(txRef);
      if (!verifyRes.ok) {
        sendJson(res, 400, { error: verifyRes.data?.message || 'Verification failed' });
        return;
      }
      txData = verifyRes.data?.data;
      if (!txData || txData.status !== 'successful') {
        sendJson(res, 400, { error: 'Payment was not successful' });
        return;
      }
      meta = txData.meta || {};
      subscriptionId = String(txData.id || '');
    } else if (gw === 'paystack') {
      if (!isPaystackConfigured()) {
        sendJson(res, 503, { error: 'Paystack is not configured' });
        return;
      }
      const verifyRes = await psVerify(txRef);
      if (!verifyRes.ok) {
        sendJson(res, 400, { error: verifyRes.data?.message || 'Verification failed' });
        return;
      }
      txData = verifyRes.data?.data;
      if (!txData || txData.status !== 'success') {
        sendJson(res, 400, { error: 'Payment was not successful' });
        return;
      }
      meta = txData.metadata || {};
      subscriptionId = String(txData.reference || txRef);
    } else {
      sendJson(res, 400, { error: 'Invalid gateway for verification' });
      return;
    }
    const planSlug = meta.plan_slug || null;
    const interval = meta.interval || tenant.subscription_interval || 'monthly';

    if (!planSlug) {
      sendJson(res, 400, { error: 'No plan metadata found in transaction' });
      return;
    }

    const periodEnd = new Date(Date.now() + (interval === 'yearly' ? 365 : 30) * 86400000).toISOString();

    if (gw === 'flutterwave') {
      await sql`
        UPDATE tenants SET
          plan = ${planSlug},
          subscription_status = 'active',
          subscription_interval = ${interval},
          flutterwave_subscription_id = ${subscriptionId},
          subscription_current_period_end = ${periodEnd},
          flutterwave_tx_ref = NULL
        WHERE id = ${tenantId}
      `;
    } else {
      await sql`
        UPDATE tenants SET
          plan = ${planSlug},
          subscription_status = 'active',
          subscription_interval = ${interval},
          flutterwave_subscription_id = ${subscriptionId},
          subscription_current_period_end = ${periodEnd},
          flutterwave_tx_ref = NULL
        WHERE id = ${tenantId}
      `;
    }

    sendJson(res, 200, {
      data: {
        plan: planSlug,
        status: 'active',
        interval,
        currentPeriodEnd: periodEnd,
      },
    });
  } catch (err) {
    console.error('[billing/verify] error:', err);
    sendJson(res, 500, { error: err.message || 'Failed to verify subscription payment' });
  }
}
