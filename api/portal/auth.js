import { sendJson, handleCors, badRequest, setCookie } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import bcryptjs from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const CLIENT_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export async function requireClientAuth(req, res) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [decodeURIComponent(k), decodeURIComponent(v.join('='))];
  }).filter(([k]) => k));

  const token = cookies.client_token;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), { clockTolerance: 60 });
    if (payload.aud !== 'client') return null;
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    // Validate client token and return client data
    const client = await requireClientAuth(req, res);
    if (!client) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    const [row] = await sql`SELECT id, name, email, portal_on, portal_url, portal_logo, portal_banner, portal_username FROM clients WHERE id = ${client.clientId}`;
    if (!row) {
      sendJson(res, 404, { error: 'Client not found' });
      return;
    }

    sendJson(res, 200, {
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        portal: {
          on: row.portal_on,
          url: row.portal_url,
          logo: row.portal_logo,
          banner: row.portal_banner,
          username: row.portal_username,
        },
      },
    });
    return;
  }

  if (req.method === 'POST') {
    const { email, password } = req.body || {};
    if (!email || !password) {
      badRequest(res, 'email and password are required');
      return;
    }

    const [client] = await sql`SELECT id, email, name, portal_on, portal_password_hash FROM clients WHERE email = ${email.toLowerCase()}`;
    if (!client || !client.portal_on || !client.portal_password_hash) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const valid = await bcryptjs.compare(password, client.portal_password_hash);
    if (!valid) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const token = await new SignJWT({
      clientId: client.id,
      email: client.email,
      name: client.name,
      aud: 'client',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getSecret());

    setCookie(res, 'client_token', token, CLIENT_COOKIE_MAX_AGE);

    sendJson(res, 200, {
      data: {
        id: client.id,
        name: client.name,
        email: client.email,
      },
    });
    return;
  }

  if (req.method === 'DELETE') {
    const cookie = 'client_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const existing = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
    sendJson(res, 200, { message: 'Logged out' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
