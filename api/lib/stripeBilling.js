import Stripe from 'stripe';

let stripeInstance = null;
export function getStripe() {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return stripeInstance;
}

export function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function getOrCreateCustomer(tenant) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  if (tenant.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(tenant.stripeCustomerId).catch(() => null);
    if (customer && !customer.deleted) return customer.id;
  }
  const customer = await stripe.customers.create({
    name: tenant.name,
    metadata: { tenant_id: String(tenant.id) },
  });
  return customer.id;
}

export async function createCheckoutSession({ customerId, plan, interval, tenantId, successUrl, cancelUrl }) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  const priceAmount = interval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const product = await stripe.products.create({ name: `${plan.name} — ${interval}` });
  const price = await stripe.prices.create({
    unit_amount: Math.round(priceAmount),
    currency: (plan.currency || 'usd').toLowerCase(),
    recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
    product: product.id,
  });

  return await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: { metadata: { tenant_id: String(tenantId), plan_slug: plan.slug, interval } },
    metadata: { tenant_id: String(tenantId), plan_slug: plan.slug, interval },
  });
}

export async function createBillingPortalSession({ customerId, returnUrl }) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

