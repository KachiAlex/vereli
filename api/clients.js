import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { status, search } = req.query || {};
    const uid = user.userId;
    let query = sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid}`;

    if (status) {
      query = sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid} AND status = ${status}`;
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      query = sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid} AND (LOWER(name) LIKE ${q} OR LOWER(contact) LIKE ${q} OR LOWER(email) LIKE ${q})`;
    }
    if (status && search) {
      const q = `%${search.toLowerCase()}%`;
      query = sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid} AND status = ${status} AND (LOWER(name) LIKE ${q} OR LOWER(contact) LIKE ${q} OR LOWER(email) LIKE ${q})`;
    }

    const rows = await query;
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      contact: r.contact,
      email: r.email,
      type: r.type,
      status: r.status,
      portal: { on: r.portal_on, url: r.portal_url },
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { name, contact, email, type = 'Service', status = 'active' } = req.body || {};
    if (!name || !contact || !email) {
      badRequest(res, 'name, contact, and email are required');
      return;
    }
    const [row] = await sql`
      INSERT INTO clients (user_id, name, contact, email, type, status)
      VALUES (${user.userId}, ${name}, ${contact}, ${email}, ${type}, ${status})
      RETURNING id, name, contact, email, type, status, portal_on, portal_url, created_at;
    `;
    const client = {
      id: row.id,
      name: row.name,
      contact: row.contact,
      email: row.email,
      type: row.type,
      status: row.status,
      portal: { on: row.portal_on, url: row.portal_url },
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: client });
    return;
  }

  badRequest(res, 'Method not allowed');
}
