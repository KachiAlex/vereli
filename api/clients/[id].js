import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import bcryptjs from 'bcryptjs';

function genPortalPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < len; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  if (req.method === 'GET') {
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_logo TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_banner TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_username TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_password_hash TEXT`;
    const [row] = user.role === 'superadmin'
      ? await sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner, portal_username, created_at FROM clients WHERE id = ${id}`
      : await sql`SELECT id, name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner, portal_username, created_at FROM clients WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
    if (!row) { notFound(res); return; }
    sendJson(res, 200, {
      data: {
        id: row.id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        type: row.type,
        status: row.status,
        portal: { on: row.portal_on, url: row.portal_url, logo: row.portal_logo, banner: row.portal_banner, username: row.portal_username },
        createdAt: row.created_at,
      }
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner, reset_portal_password, portal_password } = req.body || {};
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (contact !== undefined) { fields.push('contact = $' + (fields.length + 1)); values.push(contact); }
    if (email !== undefined) { fields.push('email = $' + (fields.length + 1)); values.push(email); }
    if (type !== undefined) { fields.push('type = $' + (fields.length + 1)); values.push(type); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }
    if (portal_on !== undefined) { fields.push('portal_on = $' + (fields.length + 1)); values.push(portal_on); }
    if (portal_url !== undefined) { fields.push('portal_url = $' + (fields.length + 1)); values.push(portal_url); }
    if (portal_logo !== undefined) { fields.push('portal_logo = $' + (fields.length + 1)); values.push(portal_logo); }
    if (portal_banner !== undefined) { fields.push('portal_banner = $' + (fields.length + 1)); values.push(portal_banner); }

    // Ensure portal columns exist
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_logo TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_banner TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_username TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_password_hash TEXT`;

    // Handle password changes
    let plainPortalPassword = '';
    if (portal_password) {
      if (portal_password.length < 6) {
        sendJson(res, 400, { error: 'Password must be at least 6 characters' });
        return;
      }
      plainPortalPassword = portal_password;
      const hash = await bcryptjs.hash(plainPortalPassword, 10);
      fields.push('portal_password_hash = $' + (fields.length + 1));
      values.push(hash);
    } else if (reset_portal_password) {
      plainPortalPassword = genPortalPassword();
      const hash = await bcryptjs.hash(plainPortalPassword, 10);
      fields.push('portal_password_hash = $' + (fields.length + 1));
      values.push(hash);
    }

    // Auto-generate password if portal is being enabled but no password exists
    if (portal_on === true && !plainPortalPassword) {
      const [existing] = user.role === 'superadmin'
        ? await sql`SELECT portal_password_hash, portal_username, email FROM clients WHERE id = ${id}`
        : await sql`SELECT portal_password_hash, portal_username, email FROM clients WHERE id = ${id} AND tenant_id = ${user.tenantId}`;
      if (existing && !existing.portal_password_hash) {
        plainPortalPassword = genPortalPassword();
        const hash = await bcryptjs.hash(plainPortalPassword, 10);
        fields.push('portal_password_hash = $' + (fields.length + 1));
        values.push(hash);
      }
      if (existing && !existing.portal_username) {
        fields.push('portal_username = $' + (fields.length + 1));
        values.push(existing.email || '');
      }
    }

    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }

    const query = user.role === 'superadmin'
      ? `UPDATE clients SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner, portal_username, created_at`
      : `UPDATE clients SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, name, contact, email, type, status, portal_on, portal_url, portal_logo, portal_banner, portal_username, created_at`;
    values.push(id);
    if (user.role !== 'superadmin') values.push(user.tenantId);
    const [row] = await sql(query, values);
    if (!row) { notFound(res); return; }
    const response = {
      data: {
        id: row.id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        type: row.type,
        status: row.status,
        portal: { on: row.portal_on, url: row.portal_url, logo: row.portal_logo, banner: row.portal_banner, username: row.portal_username },
        createdAt: row.created_at,
      }
    };
    if (plainPortalPassword) {
      response.portalCredentials = { username: row.portal_username || row.email, password: plainPortalPassword };
    }
    sendJson(res, 200, response);
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
