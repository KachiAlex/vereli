import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Date.now().toString(36);
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // Only superadmin can access tenant management
  if (user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'Only superadmin can manage tenants' });
    return;
  }

  if (req.method === 'GET') {
    // List all tenants
    try {
      const { status, plan } = req.query || {};
      let rows;
      
      if (status && plan) {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.created_at, 
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.status = ${status} AND t.plan = ${plan} ORDER BY t.created_at DESC`;
      } else if (status) {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.status = ${status} ORDER BY t.created_at DESC`;
      } else if (plan) {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.plan = ${plan} ORDER BY t.created_at DESC`;
      } else {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t ORDER BY t.created_at DESC`;
      }
      
      const data = rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        plan: r.plan,
        settings: r.settings,
        userCount: parseInt(r.user_count),
        clientCount: parseInt(r.client_count),
        createdAt: r.created_at,
      }));
      
      sendJson(res, 200, { data });
    } catch (err) {
      console.error('Error fetching tenants:', err);
      sendJson(res, 500, { error: 'Failed to fetch tenants' });
    }
    return;
  }

  if (req.method === 'POST') {
    // Create new tenant (superadmin manually creates tenant)
    const { name, plan = 'trial', adminEmail, adminName, adminPassword } = req.body || {};
    
    if (!name) {
      badRequest(res, 'name is required');
      return;
    }
    
    if (!adminEmail || !adminPassword) {
      badRequest(res, 'adminEmail and adminPassword are required to assign an admin');
      return;
    }

    try {
      // Check if admin email already exists
      const [existingUser] = await sql`SELECT id FROM users WHERE email = ${adminEmail.toLowerCase()}`;
      if (existingUser) {
        sendJson(res, 409, { error: 'Admin email already registered' });
        return;
      }

      // Create tenant
      const slug = generateSlug(name);
      const [tenant] = await sql`
        INSERT INTO tenants (name, slug, status, plan)
        VALUES (${name}, ${slug}, 'active', ${plan})
        RETURNING id, name, slug, status, plan, created_at;
      `;

      // Create admin user for tenant
      const [admin] = await sql`
        INSERT INTO users (email, password_hash, name, tenant_id, role)
        VALUES (${adminEmail.toLowerCase()}, ${adminPassword}, ${adminName || 'Admin'}, ${tenant.id}, 'admin')
        RETURNING id, email, name, role;
      `;

      // Add to team_members
      await sql`
        INSERT INTO team_members (tenant_id, user_id, email, name, role, status)
        VALUES (${tenant.id}, ${admin.id}, ${adminEmail.toLowerCase()}, ${adminName || 'Admin'}, 'admin', 'active')
      `;

      sendJson(res, 201, { 
        data: { 
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
            plan: tenant.plan,
            createdAt: tenant.created_at,
          },
          admin: {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
          }
        } 
      });
    } catch (err) {
      console.error('Error creating tenant:', err);
      sendJson(res, 500, { error: 'Failed to create tenant' });
    }
    return;
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    // Update tenant status/plan
    const { tenantId } = req.query || {};
    if (!tenantId) {
      badRequest(res, 'tenantId query parameter is required');
      return;
    }

    const { status, plan, name } = req.body || {};
    if (status === undefined && plan === undefined && name === undefined) {
      badRequest(res, 'No fields to update');
      return;
    }

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (status !== undefined) {
        fields.push(`status = $${paramCount++}`);
        values.push(status);
      }
      if (plan !== undefined) {
        fields.push(`plan = $${paramCount++}`);
        values.push(plan);
      }
      if (name !== undefined) {
        fields.push(`name = $${paramCount++}`);
        values.push(name);
      }

      const query = `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, name, slug, status, plan, settings, created_at`;
      values.push(tenantId);

      const [tenant] = await sql(query, values);
      
      if (!tenant) {
        sendJson(res, 404, { error: 'Tenant not found' });
        return;
      }

      sendJson(res, 200, { 
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan,
          settings: tenant.settings,
          createdAt: tenant.created_at,
        }
      });
    } catch (err) {
      console.error('Error updating tenant:', err);
      sendJson(res, 500, { error: 'Failed to update tenant' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    // Soft delete / suspend tenant
    const { tenantId } = req.query || {};
    if (!tenantId) {
      badRequest(res, 'tenantId query parameter is required');
      return;
    }

    try {
      const [tenant] = await sql`
        UPDATE tenants SET status = 'suspended' WHERE id = ${tenantId}
        RETURNING id, name, slug, status, plan, created_at;
      `;
      
      if (!tenant) {
        sendJson(res, 404, { error: 'Tenant not found' });
        return;
      }

      sendJson(res, 200, { 
        message: 'Tenant suspended successfully',
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan,
          createdAt: tenant.created_at,
        }
      });
    } catch (err) {
      console.error('Error suspending tenant:', err);
      sendJson(res, 500, { error: 'Failed to suspend tenant' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
