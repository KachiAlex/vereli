import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const { status, search } = req.query || {};
    let query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients`;

    if (status) {
      query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE status = ${status}`;
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE LOWER(name) LIKE ${q} OR LOWER(contact) LIKE ${q} OR LOWER(email) LIKE ${q}`;
    }
    if (status && search) {
      const q = `%${search.toLowerCase()}%`;
      query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE status = ${status} AND (LOWER(name) LIKE ${q} OR LOWER(contact) LIKE ${q} OR LOWER(email) LIKE ${q})`;
    }

    const rows = await query;
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      contact: r.contact,
      email: r.email,
      status: r.status,
      portal: { on: r.portal_on, url: r.portal_url },
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { name, contact, email, status = 'active' } = req.body || {};
    if (!name || !contact || !email) {
      badRequest(res, 'name, contact, and email are required');
      return;
    }
    const [row] = await sql`
      INSERT INTO clients (name, contact, email, status)
      VALUES (${name}, ${contact}, ${email}, ${status})
      RETURNING id, name, contact, email, status, portal_on, portal_url, created_at;
    `;
    const client = {
      id: row.id,
      name: row.name,
      contact: row.contact,
      email: row.email,
      status: row.status,
      portal: { on: row.portal_on, url: row.portal_url },
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: client });
    return;
  }

  badRequest(res, 'Method not allowed');
}
