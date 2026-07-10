import { sendJson, handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const tenantId = user.tenantId;
  if (!tenantId) {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  try {
    const [tenant] = await sql`
      SELECT id, name, plan, subscription_status, subscription_interval, stripe_customer_id,
             stripe_subscription_id, subscription_current_period_end, trial_ends_at
      FROM tenants WHERE id = ${tenantId}
    `;
    if (!tenant) {
      sendJson(res, 404, { error: 'Tenant not found' });
      return;
    }
    const [plan] = await sql`
      SELECT id, name, slug, description, price_monthly, price_yearly, currency,
             user_limit, client_limit, features, sort_order
      FROM plans WHERE slug = ${tenant.plan}
    `;

    const userCount = await sql`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = ${tenantId}`;
    const clientCount = await sql`SELECT COUNT(*)::int AS c FROM clients WHERE tenant_id = ${tenantId}`;

    sendJson(res, 200, {
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          plan: tenant.plan,
          subscriptionStatus: tenant.subscription_status,
          subscriptionInterval: tenant.subscription_interval,
          stripeCustomerId: tenant.stripe_customer_id,
          stripeSubscriptionId: tenant.stripe_subscription_id,
          currentPeriodEnd: tenant.subscription_current_period_end,
          trialEndsAt: tenant.trial_ends_at,
        },
        plan,
        usage: {
          users: userCount[0].c,
          clients: clientCount[0].c,
        }
      }
    });
  } catch (err) {
    console.error('[billing/subscription] error:', err);
    sendJson(res, 500, { error: 'Failed to fetch subscription' });
  }
}
