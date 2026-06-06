import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { status, search } = req.query || {};
    const uid = user.userId;
    let rows;
    try {
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
      rows = await query;
    } catch (err) {
      // type column may not exist yet in old databases
      let query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid}`;
      if (status) {
        query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid} AND status = ${status}`;
      }
      if (search) {
        const q = `%${search.toLowerCase()}%`;
        query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid} AND (LOWER(name) LIKE ${q} OR LOWER(contact) LIKE ${q} OR LOWER(email) LIKE ${q})`;
      }
      if (status && search) {
        const q = `%${search.toLowerCase()}%`;
        query = sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE user_id = ${uid} AND status = ${status} AND (LOWER(name) LIKE ${q} OR LOWER(contact) LIKE ${q} OR LOWER(email) LIKE ${q})`;
      }
      rows = await query;
    }

    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      contact: r.contact,
      email: r.email,
      type: r.type || 'Service',
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
    let row;
    try {
      [row] = await sql`
        INSERT INTO clients (user_id, name, contact, email, type, status)
        VALUES (${user.userId}, ${name}, ${contact}, ${email}, ${type}, ${status})
        RETURNING id, name, contact, email, type, status, portal_on, portal_url, created_at;
      `;
    } catch (err) {
      // type column may not exist yet in old databases
      [row] = await sql`
        INSERT INTO clients (user_id, name, contact, email, status)
        VALUES (${user.userId}, ${name}, ${contact}, ${email}, ${status})
        RETURNING id, name, contact, email, status, portal_on, portal_url, created_at;
      `;
    }
    const client = {
      id: row.id,
      name: row.name,
      contact: row.contact,
      email: row.email,
      type: row.type || type,
      status: row.status,
      portal: { on: row.portal_on, url: row.portal_url },
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: client });
    return;
  }

  badRequest(res, 'Method not allowed');
}
