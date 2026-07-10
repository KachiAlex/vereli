const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const BASE_URL = 'https://api.paystack.co/v1';

export function isPaystackConfigured() {
  return !!SECRET_KEY && !!PUBLIC_KEY;
}

export function getPaystackPublicKey() {
  return PUBLIC_KEY;
}

async function psFetch(path, options = {}) {
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
  return { ok: res.ok && json.status === true, status: res.status, data: json };
}

export async function initializeTransaction({ reference, amount, currency, email, name, callbackUrl, metadata = {} }) {
  // Paystack expects amount in kobo/cents
  const payload = {
    email,
    amount: Math.round(amount),
    reference,
    callback_url: callbackUrl || undefined,
    metadata: { ...metadata, name: name || email },
  };
  return await psFetch('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyTransaction(reference) {
  return await psFetch(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
  });
}

export function generateTxRef(prefix = 'VRL') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
