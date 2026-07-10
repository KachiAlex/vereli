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

export async function initializePayment({ txRef, amount, currency, redirectUrl, customerEmail, customerName, meta = {} }) {
  const payload = {
    tx_ref: txRef,
    amount,
    currency,
    redirect_url: redirectUrl,
    customer: {
      email: customerEmail,
      name: customerName || '',
    },
    meta,
    customizations: {
      title: 'Vereli Invoice Payment',
      description: `Payment for invoice`,
    },
  };

  return await fwFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyTransaction(transactionId) {
  return await fwFetch(`/transactions/${transactionId}/verify`, {
    method: 'GET',
  });
}

export function generateTxRef(prefix = 'VRL') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
