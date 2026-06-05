import { sendJson, handleCors, badRequest, notFound } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = await sql`SELECT id, name, contact, email, status, portal_on, portal_url, created_at FROM clients WHERE id = ${id}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, {
      data: {
        id: row.id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        status: row.status,
        portal: { on: row.portal_on, url: row.portal_url },
        createdAt: row.created_at,
      }
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, contact, email, status, portal_on, portal_url } = req.body || {};
    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (contact !== undefined) updates.push(sql`contact = ${contact}`);
    if (email !== undefined) updates.push(sql`email = ${email}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);
    if (portal_on !== undefined) updates.push(sql`portal_on = ${portal_on}`);
    if (portal_url !== undefined) updates.push(sql`portal_url = ${portal_url}`);

    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }

    const [row] = await sql`
      UPDATE clients SET ${sql.join(updates, sql`, `)} WHERE id = ${id}
      RETURNING id, name, contact, email, status, portal_on, portal_url, created_at;
    `;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, {
      data: {
        id: row.id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        status: row.status,
        portal: { on: row.portal_on, url: row.portal_url },
        createdAt: row.created_at,
      }
    });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = await sql`DELETE FROM clients WHERE id = ${id} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Client deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
