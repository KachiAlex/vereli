const SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || '';
const PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
const BASE_URL = 'https://api.flutterwave.com/v3';

export function isFlutterwaveConfigured() {
  return !!SECRET_KEY && !!PUBLIC_KEY;
}

export function getFlutterwavePublicKey() {
  return PUBLIC_KEY;
}

async function fwFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json };
}

export async function getOrCreatePaymentPlan({ planSlug, planName, amount, interval, currency = 'NGN' }) {
  const intervalMap = { monthly: 30, yearly: 365 };
  const days = intervalMap[interval] || 30;

  const planNameStr = `${planSlug}-${interval}`;
  const existing = await fwFetch(`/payment-plans?name=${encodeURIComponent(planNameStr)}`);
  if (existing.ok && existing.data?.data?.length > 0) {
    return existing.data.data[0];
  }

  const response = await fwFetch('/payment-plans', {
    method: 'POST',
    body: JSON.stringify({
      name: planNameStr,
      amount,
      interval: `every ${days} days`,
      duration: interval === 'yearly' ? 0 : 0,
      currency,
    }),
  });

  if (response.ok && response.data?.data?.id) {
    return response.data.data;
  }

  throw new Error(response.data?.message || 'Failed to create payment plan');
}

export async function initializeSubscriptionPayment({ txRef, amount, currency, customerEmail, customerName, paymentPlanId, meta = {}, redirectUrl }) {
  const payload = {
    tx_ref: txRef,
    amount,
    currency,
    redirect_url: redirectUrl,
    payment_plan: paymentPlanId,
    customer: {
      email: customerEmail,
      name: customerName || '',
    },
    meta,
    customizations: {
      title: 'Vereli Subscription',
      description: `Vereli plan subscription`,
    },
  };

  return await fwFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyTransaction(txRef) {
  return await fwFetch(`/transactions/verify?tx_ref=${txRef}`, {
    method: 'GET',
  });
}

export async function getSubscription(subscriptionId) {
  return await fwFetch(`/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });
}

export async function cancelSubscription(subscriptionId) {
  return await fwFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'PUT',
  });
}

export function generateTxRef(prefix = 'VSUB') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
