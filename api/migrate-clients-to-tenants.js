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

  /* ══ GET: Preview what will be migrated ══ */
  if (req.method === 'GET') {
    try {
      const clients = await sql`
        SELECT c.id, c.tenant_id, c.user_id, c.name as client_name,
               t.name as current_tenant_name,
               u.email as owner_email, u.name as owner_name, u.role as owner_role
        FROM clients c
        JOIN tenants t ON c.tenant_id = t.id
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY c.id
      `;

      // Group by tenant to find multi-client tenants
      const tenantClients = {};
      for (const c of clients) {
        if (!tenantClients[c.tenant_id]) tenantClients[c.tenant_id] = [];
        tenantClients[c.tenant_id].push(c);
      }

      const outline = [];
      for (const c of clients) {
        const sameTenantCount = tenantClients[c.tenant_id].length;
        const needsMigration = sameTenantCount > 1;
        outline.push({
          clientId: c.id,
          clientName: c.client_name,
          currentTenant: c.current_tenant_name,
          tenantClientCount: sameTenantCount,
          willMigrate: needsMigration,
          ownerEmail: c.owner_email,
          ownerName: c.owner_name,
          ownerRole: c.owner_role,
          adminAssignment: needsMigration
            ? (c.user_id
              ? { userId: c.user_id, email: c.owner_email, name: c.owner_name, role: 'tenant admin' }
              : { note: 'No user_id on client record; will search tenant for an admin user' })
            : null,
          newTenantName: needsMigration ? c.client_name : null,
        });
      }

      sendJson(res, 200, { data: { clients: outline, total: clients.length, willMigrate: outline.filter(x => x.willMigrate).length } });
    } catch (err) {
      console.error('Preview error:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  /* ══ POST: Execute migration ══ */
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
        VALUES (${client.name}, ${slug}, 'active', 'starter')
        RETURNING id;
      `;

      await sql`UPDATE clients SET tenant_id = ${tenant.id} WHERE id = ${client.id}`;

      /* ══ Admin assignment ══ */
      let adminUserId = client.user_id;

      // If client has no user_id, find the first admin/manager in the original tenant
      if (!adminUserId) {
        const [foundAdmin] = await sql`
          SELECT id FROM users
          WHERE tenant_id = ${client.tenant_id} AND role IN ('admin', 'manager')
          ORDER BY id LIMIT 1
        `;
        if (foundAdmin) adminUserId = foundAdmin.id;
      }

      if (adminUserId) {
        await sql`UPDATE users SET tenant_id = ${tenant.id}, role = 'admin' WHERE id = ${adminUserId}`;
        await sql`UPDATE team_members SET tenant_id = ${tenant.id} WHERE user_id = ${adminUserId}`;
      } else {
        // If no admin found, create one from the client contact info
        const contactName = client.contact || client.name + ' Admin';
        const contactEmail = client.email || 'admin-' + client.id + '@placeholder.vereli';
        const [newAdmin] = await sql`
          INSERT INTO users (email, password_hash, name, role, tenant_id)
          VALUES (${contactEmail.toLowerCase()}, ${'temp-' + Date.now()}, ${contactName}, 'admin', ${tenant.id})
          RETURNING id;
        `;
        adminUserId = newAdmin.id;
        await sql`UPDATE clients SET user_id = ${adminUserId} WHERE id = ${client.id}`;
      }

      // Move all other users that belong to this client under the new tenant
      // (users whose original tenant matches the client's original tenant)
      await sql`UPDATE users SET tenant_id = ${tenant.id} WHERE tenant_id = ${client.tenant_id} AND id != ${adminUserId} AND role = 'member'`;
      await sql`UPDATE team_members SET tenant_id = ${tenant.id} WHERE tenant_id = ${client.tenant_id}`;

      await sql`UPDATE projects SET tenant_id = ${tenant.id} WHERE client_id = ${client.id}`;
      await sql`UPDATE work_areas SET tenant_id = ${tenant.id} WHERE client_id = ${client.id}`;
      await sql`UPDATE invoices SET tenant_id = ${tenant.id} WHERE client_id = ${client.id}`;

      await sql`UPDATE tasks SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE files SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE comments SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE approvals SET tenant_id = ${tenant.id} WHERE work_area_id IN (SELECT id FROM work_areas WHERE client_id = ${client.id})`;
      await sql`UPDATE payments SET tenant_id = ${tenant.id} WHERE invoice_id IN (SELECT id FROM invoices WHERE client_id = ${client.id})`;

      results.push({ clientId: client.id, name: client.name, action: 'migrated', tenantId: tenant.id, adminUserId });
    }

    sendJson(res, 200, { data: { migrated: results } });
  } catch (err) {
    console.error('Migration error:', err);
    sendJson(res, 500, { error: err.message });
  }
}
