import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    const [row] = user.role === 'superadmin'
      ? await sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, created_at FROM clients WHERE id = ${id}`
      : await sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, created_at FROM clients WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, {
      data: {
        id: row.id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        type: row.type,
        status: row.status,
        portal: { on: row.portal_on, url: row.portal_url },
        createdAt: row.created_at,
      }
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, contact, email, type, status, portal_on, portal_url } = req.body || {};
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (contact !== undefined) { fields.push('contact = $' + (fields.length + 1)); values.push(contact); }
    if (email !== undefined) { fields.push('email = $' + (fields.length + 1)); values.push(email); }
    if (type !== undefined) { fields.push('type = $' + (fields.length + 1)); values.push(type); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (portal_on !== undefined) { fields.push('portal_on = $' + (fields.length + 1)); values.push(portal_on); }
    if (portal_url !== undefined) { fields.push('portal_url = $' + (fields.length + 1)); values.push(portal_url); }

    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }

    const query = user.role === 'superadmin'
      ? `UPDATE clients SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, name, contact, email, type, status, portal_on, portal_url, created_at`
      : `UPDATE clients SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, name, contact, email, type, status, portal_on, portal_url, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    sendJson(res, 200, {
      data: {
        id: row.id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        type: row.type,
        status: row.status,
        portal: { on: row.portal_on, url: row.portal_url },
        createdAt: row.created_at,
      }
    });
    return;
  }

  if (req.method === 'DELETE') {
    const [row] = user.role === 'superadmin'
      ? await sql`DELETE FROM clients WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM clients WHERE id = ${id} AND tenant_id = ${user.tenantId} RETURNING id`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, { message: 'Client deleted' });
    return;
  }

  badRequest(res, 'Method not allowed');
}
