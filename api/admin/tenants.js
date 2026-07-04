import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import bcryptjs from 'bcryptjs';

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
  const isSuperadmin = user.role === 'superadmin' || (user.email || '').toLowerCase() === 'admin@vereli.com';
  if (!isSuperadmin) {
    sendJson(res, 403, { error: 'Only superadmin can manage tenants' });
    return;
  }

  if (req.method === 'GET') {
    try {
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT`;
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color TEXT`;

      const { tenantId, status, plan } = req.query || {};

      // Single tenant fetch
      if (tenantId) {
        const [tenant] = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.logo_url, t.primary_color, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.id = ${tenantId}`;
        if (!tenant) {
          sendJson(res, 404, { error: 'Tenant not found' });
          return;
        }
        // Fetch tenant admin
        const [admin] = await sql`SELECT id, email, name, role FROM users WHERE tenant_id = ${tenantId} AND role = 'admin' LIMIT 1`;
        sendJson(res, 200, {
          data: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
            plan: tenant.plan,
            settings: tenant.settings,
            logoUrl: tenant.logo_url,
            primaryColor: tenant.primary_color,
            userCount: parseInt(tenant.user_count),
            clientCount: parseInt(tenant.client_count),
            createdAt: tenant.created_at,
            admin: admin ? { id: admin.id, email: admin.email, name: admin.name, role: admin.role } : null,
          }
        });
        return;
      }

      // List all tenants
      let rows;
      if (status && plan) {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.logo_url, t.primary_color, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.status = ${status} AND t.plan = ${plan} ORDER BY t.created_at DESC`;
      } else if (status) {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.logo_url, t.primary_color, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.status = ${status} ORDER BY t.created_at DESC`;
      } else if (plan) {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.logo_url, t.primary_color, t.created_at,
          (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM clients WHERE tenant_id = t.id) as client_count
          FROM tenants t WHERE t.plan = ${plan} ORDER BY t.created_at DESC`;
      } else {
        rows = await sql`SELECT t.id, t.name, t.slug, t.status, t.plan, t.settings, t.logo_url, t.primary_color, t.created_at,
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
        logoUrl: r.logo_url,
        primaryColor: r.primary_color,
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
    if (adminPassword.length < 6) {
      badRequest(res, 'adminPassword must be at least 6 characters');
      return;
    }

    try {
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT`;
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color TEXT`;

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

      // Hash password and create admin user for tenant
      const passwordHash = await bcryptjs.hash(adminPassword, 10);
      const [admin] = await sql`
        INSERT INTO users (email, password_hash, name, tenant_id, role)
        VALUES (${adminEmail.toLowerCase()}, ${passwordHash}, ${adminName || 'Admin'}, ${tenant.id}, 'admin')
        RETURNING id, email, name, role;
      `;

      // Ensure team_members table exists and add admin
      await sql`CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
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

    const { status, plan, name, logoUrl, primaryColor } = req.body || {};
    if (status === undefined && plan === undefined && name === undefined && logoUrl === undefined && primaryColor === undefined) {
      badRequest(res, 'No fields to update');
      return;
    }

    try {
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT`;
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color TEXT`;

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
      if (logoUrl !== undefined) {
        fields.push(`logo_url = $${paramCount++}`);
        values.push(logoUrl);
      }
      if (primaryColor !== undefined) {
        fields.push(`primary_color = $${paramCount++}`);
        values.push(primaryColor);
      }

      const query = `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, name, slug, status, plan, settings, logo_url, primary_color, created_at`;
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
          logoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color,
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
