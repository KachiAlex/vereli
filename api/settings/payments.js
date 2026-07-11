import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { isFlutterwaveConfigured, getFlutterwavePublicKey } from '../lib/flutterwaveBilling.js';
import { isPaystackConfigured, getPaystackPublicKey } from '../lib/paystack.js';
import { isStripeConfigured } from '../lib/stripeBilling.js';

const GATEWAY_META = {
  flutterwave: { name: 'Flutterwave', color: '#F5A623', description: 'Accept payments via cards, bank transfers, USSD' },
  paystack: { name: 'Paystack', color: '#10B981', description: 'Accept payments via cards, bank transfers, USSD' },
  stripe: { name: 'Stripe', color: '#635BFF', description: 'Accept payments globally via cards' },
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId) {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const [tenant] = await sql`SELECT settings FROM tenants WHERE id = ${tenantId}`;
      const settings = tenant?.settings || {};
      const gateways = settings.paymentGateways || {};

      const available = {};
      for (const [key, meta] of Object.entries(GATEWAY_META)) {
        let configured = false;
        let publicKey = null;
        if (key === 'flutterwave') { configured = isFlutterwaveConfigured(); publicKey = getFlutterwavePublicKey(); }
        else if (key === 'paystack') { configured = isPaystackConfigured(); publicKey = getPaystackPublicKey(); }
        else if (key === 'stripe') { configured = isStripeConfigured(); }

        available[key] = {
          ...meta,
          configured,
          enabled: gateways[key]?.enabled ?? false,
          publicKey,
        };
      }

      sendJson(res, 200, { data: { gateways: available } });
    } catch (err) {
      console.error('[settings/payments] GET error:', err);
      sendJson(res, 500, { error: 'Failed to fetch payment settings' });
    }
    return;
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const { gateways } = req.body || {};
    if (!gateways || typeof gateways !== 'object') {
      badRequest(res, 'gateways object is required');
      return;
    }

    try {
      const [tenant] = await sql`SELECT settings FROM tenants WHERE id = ${tenantId}`;
      const current = tenant?.settings || {};
      const currentGateways = current.paymentGateways || {};

      const nextGateways = {};
      for (const key of Object.keys(GATEWAY_META)) {
        const isEnabled = gateways[key]?.enabled === true;
        let canEnable = false;
        if (key === 'flutterwave') canEnable = isFlutterwaveConfigured();
        else if (key === 'paystack') canEnable = isPaystackConfigured();
        else if (key === 'stripe') canEnable = isStripeConfigured();

        nextGateways[key] = {
          enabled: canEnable ? isEnabled : false,
          connectedAt: isEnabled ? (currentGateways[key]?.connectedAt || new Date().toISOString()) : null,
        };
      }

      const next = { ...current, paymentGateways: nextGateways };
      await sql`UPDATE tenants SET settings = ${JSON.stringify(next)} WHERE id = ${tenantId}`;

      sendJson(res, 200, { data: { gateways: nextGateways } });
    } catch (err) {
      console.error('[settings/payments] PATCH error:', err);
      sendJson(res, 500, { error: 'Failed to update payment settings' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
