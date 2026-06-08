import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const isSuperadmin = user.role === 'superadmin' || (user.email || '').toLowerCase() === 'admin@vereli.com';
  if (!isSuperadmin) {
    sendJson(res, 403, { error: 'Only superadmin' });
    return;
  }

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  try {
    const clients = await sql`SELECT id, tenant_id, user_id, name, contact, email FROM clients ORDER BY id`;
    const results = [];

    for (const client of clients) {
      const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM clients WHERE tenant_id = ${client.tenant_id}`;

      if (count <= 1) {
        results.push({ clientId: client.id, name: client.name, action: 'skipped', reason: 'already has unique tenant' });
        continue;
      }

      const slug = client.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

      const [tenant] = await sql`
        INSERT INTO tenants (name, slug, status, plan)
        VALUES (${client.name}, ${slug}, 'active', 'trial')
        RETURNING id;
      `;

      await sql`UPDATE clients SET tenant_id = ${tenant.id} WHERE id = ${client.id}`;

      if (client.user_id) {
        await sql`UPDATE users SET tenant_id = ${tenant.id}, role = 'admin' WHERE id = ${client.user_id}`;
        await sql`UPDATE team_members SET tenant_id = ${tenant.id} WHERE user_id = ${client.user_id}`;
      }

      await sql`UPDATE projects SET tenant_id = ${tenant.id} WHERE client_id = ${client.id}`;
      await sql`UPDATE work_areas SET tenant_id = ${tenant.id} WHERE client_id = ${client.id}`;
      await sql`UPDATE invoices SET tenant_id = ${tenant.id} WHERE client_id = ${client.id}`;

      await sql`UPDATE tasks SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE files SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE comments SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE approvals SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE payments SET tenant_id = ${tenant.id} WHERE invoice_id IN (SELECT id FROM invoices WHERE client_id = ${client.id})`;

      results.push({ clientId: client.id, name: client.name, action: 'migrated', tenantId: tenant.id });
    }

    sendJson(res, 200, { data: { migrated: results } });
  } catch (err) {
    console.error('Migration error:', err);
    sendJson(res, 500, { error: err.message });
  }
}
