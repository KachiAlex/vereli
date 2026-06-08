import { sendJson, handleCors } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    // 1. Create tenants table first (foundation of multi-tenancy)
    await sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        plan TEXT NOT NULL DEFAULT 'trial',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // 2. Update users table with tenant support
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    // Migration: remove old company column, add tenant_id
    await sql`ALTER TABLE users DROP COLUMN IF EXISTS company`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL`;
    // Update role values: superadmin, admin, manager, member
    await sql`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member'`;

    // 3. Create invitations table for team member invites
    await sql`
      CREATE TABLE IF NOT EXISTS invitations (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        token TEXT NOT NULL UNIQUE,
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // 4. Update clients table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        email TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'Service',
        status TEXT NOT NULL DEFAULT 'active',
        portal_on BOOLEAN NOT NULL DEFAULT false,
        portal_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Service'`;
    await sql`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_email_key`;
    // Make email unique per tenant instead of globally
    await sql`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_email_tenant_unique`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_tenant ON clients(email, tenant_id)`;

    // 5. Update projects table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        budget INTEGER NOT NULL DEFAULT 0,
        tasks_total INTEGER NOT NULL DEFAULT 0,
        tasks_pending INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 6. Update invoices table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        status TEXT NOT NULL DEFAULT 'pending',
        due_date TIMESTAMPTZ NOT NULL,
        line_items JSONB,
        sent_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;

    // 7. Create payments table
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        method TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 8. Update work_areas table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS work_areas (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'active',
        progress INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE work_areas ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 9. Update tasks table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false,
        assignee TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 10. Update files table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'document',
        size TEXT,
        visibility TEXT NOT NULL DEFAULT 'internal',
        uploader_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 11. Update comments table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        author_initials TEXT,
        author_bg TEXT,
        author_tc TEXT,
        text TEXT NOT NULL,
        reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 12. Update approvals table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        item TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 13. Update team_members table with tenant_id
    await sql`
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'invited',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`;

    // 14. Early access table (no tenant - global)
    await sql`
      CREATE TABLE IF NOT EXISTS early_access (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        company TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // MIGRATION: Migrate existing data to multi-tenant structure
    // This runs once to convert existing single-user data to tenant structure
    const [existingUser] = await sql`SELECT id, email, name, role FROM users WHERE tenant_id IS NULL AND role != 'superadmin' ORDER BY id LIMIT 1`;
    if (existingUser) {
      // Create a tenant for the first existing user
      const [tenant] = await sql`
        INSERT INTO tenants (name, slug, status, plan)
        VALUES (${existingUser.name || existingUser.email + ' Workspace'}, ${'workspace-' + existingUser.id}, 'active', 'trial')
        RETURNING id;
      `;
      
      // Update user to be admin of this tenant
      await sql`UPDATE users SET tenant_id = ${tenant.id}, role = 'admin' WHERE id = ${existingUser.id}`;
      
      // Migrate all data to include tenant_id
      await sql`UPDATE clients SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE projects SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE invoices SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE work_areas SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE tasks SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE files SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE comments SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE approvals SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
      await sql`UPDATE team_members SET tenant_id = ${tenant.id} WHERE tenant_id IS NULL`;
    }

    // Seed demo data if no clients exist and we have a tenant with an admin
    const [tenantCount] = await sql`SELECT COUNT(*)::int AS count FROM tenants`;
    const [clientCount] = await sql`SELECT COUNT(*)::int AS count FROM clients`;
    
    if (tenantCount.count === 0) {
      // No tenants yet - database is fresh, will be populated by user registration
      sendJson(res, 200, { message: 'Multi-tenant database schema created successfully' });
      return;
    }

    if (clientCount.count === 0) {
      // Get the first tenant admin to seed data for
      const [firstAdmin] = await sql`
        SELECT u.id, u.tenant_id 
        FROM users u 
        WHERE u.role = 'admin' OR u.role = 'superadmin'
        ORDER BY u.id 
        LIMIT 1
      `;
      
      if (firstAdmin) {
        const uid = firstAdmin.id;
        const tid = firstAdmin.tenant_id;
        
        const [c1] = await sql`
          INSERT INTO clients (tenant_id, user_id, name, contact, email, type, status, portal_on, portal_url)
          VALUES (${tid}, ${uid}, 'Meridian Advisory', 'Sarah Okafor', 'sarah@meridian.ng', 'Advisory', 'active', true, 'https://vereli.kite.space/portal/meridian')
          RETURNING id;
        `;
        const [c2] = await sql`
          INSERT INTO clients (tenant_id, user_id, name, contact, email, type, status, portal_on)
          VALUES (${tid}, ${uid}, 'Nova Digital', 'Chidi Nwosu', 'chidi@novadigital.ng', 'Brand & Marketing', 'active', false)
          RETURNING id;
        `;
        const [c3] = await sql`
          INSERT INTO clients (tenant_id, user_id, name, contact, email, type, status, portal_on)
          VALUES (${tid}, ${uid}, 'Lumina Studio', 'Amara Bello', 'amara@luminastudio.ng', 'Design Project', 'inactive', false)
          RETURNING id;
        `;

        const [p1] = await sql`
          INSERT INTO projects (tenant_id, user_id, client_id, name, status, budget, tasks_total, tasks_pending)
          VALUES (${tid}, ${uid}, ${c1.id}, 'Q3 Strategy Review', 'in_progress', 2500000, 8, 3)
          RETURNING id;
        `;
        const [p2] = await sql`
          INSERT INTO projects (tenant_id, user_id, client_id, name, status, budget, tasks_total, tasks_pending)
          VALUES (${tid}, ${uid}, ${c2.id}, 'Website Redesign', 'pending', 1800000, 12, 12)
          RETURNING id;
        `;
        const [p3] = await sql`
          INSERT INTO projects (tenant_id, user_id, client_id, name, status, budget, tasks_total, tasks_pending)
          VALUES (${tid}, ${uid}, ${c1.id}, 'Brand Audit', 'completed', 900000, 5, 0)
          RETURNING id;
        `;

        const [inv1] = await sql`
          INSERT INTO invoices (tenant_id, user_id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at)
          VALUES (${tid}, ${uid}, ${c1.id}, ${p3.id}, 900000, 'NGN', 'paid', '2025-03-15T00:00:00Z',
            '[{"desc":"Brand Audit","qty":1,"rate":900000}]'::jsonb, '2025-03-01T00:00:00Z', '2025-03-10T00:00:00Z')
          RETURNING id;
        `;
        const [inv2] = await sql`
          INSERT INTO invoices (tenant_id, user_id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at)
          VALUES (${tid}, ${uid}, ${c2.id}, ${p2.id}, 1800000, 'NGN', 'sent', '2025-06-15T00:00:00Z',
            '[{"desc":"Website Design","qty":1,"rate":1200000},{"desc":"Development","qty":1,"rate":600000}]'::jsonb, '2025-05-20T00:00:00Z')
          RETURNING id;
        `;
        await sql`
          INSERT INTO payments (tenant_id, user_id, invoice_id, amount, currency, method, note)
          VALUES (${tid}, ${uid}, ${inv1.id}, 900000, 'NGN', 'Bank transfer', 'Full payment received');
        `;

        // Seed work areas, tasks, files for c1 (Meridian)
        const [wa1] = await sql`
          INSERT INTO work_areas (tenant_id, user_id, client_id, name, type, status, progress)
          VALUES (${tid}, ${uid}, ${c1.id}, 'Q3 Campaign', 'marketing', 'active', 65)
          RETURNING id;
        `;
        const [wa2] = await sql`
          INSERT INTO work_areas (tenant_id, user_id, client_id, name, type, status, progress)
          VALUES (${tid}, ${uid}, ${c1.id}, 'Brand Guidelines', 'design', 'active', 30)
          RETURNING id;
        `;
        await sql`
          INSERT INTO tasks (tenant_id, user_id, work_area_id, text, done, assignee, status, priority) VALUES
          (${tid}, ${uid}, ${wa1.id}, 'Write creative brief', true, 'You', 'completed', 'high'),
          (${tid}, ${uid}, ${wa1.id}, 'Design banner ads', false, 'You', 'in-progress', 'high'),
          (${tid}, ${uid}, ${wa1.id}, 'Review with client', false, null, 'todo', 'medium'),
          (${tid}, ${uid}, ${wa2.id}, 'Compile logo variants', false, 'You', 'in-progress', 'medium');
        `;
        await sql`
          INSERT INTO files (tenant_id, user_id, work_area_id, name, type, size, visibility, uploader_name) VALUES
          (${tid}, ${uid}, ${wa1.id}, 'Creative-brief-v2.pdf', 'PDF', '1.2 MB', 'shared', 'You'),
          (${tid}, ${uid}, ${wa2.id}, 'Logo-explorations.fig', 'Figma', '4.5 MB', 'internal', 'You');
        `;
        await sql`
          INSERT INTO comments (tenant_id, user_id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference) VALUES
          (${tid}, ${uid}, ${wa1.id}, 'Sarah Okafor', 'SO', '#E4F2F0', '#0B4F52', 'Love the direction — can we use this style throughout?', 'Creative-brief-v2.pdf'),
          (${tid}, ${uid}, ${wa2.id}, 'Sarah Okafor', 'SO', '#E4F2F0', '#0B4F52', 'Colours adjusted — perfect now.', 'Logo-explorations.fig');
        `;
        await sql`
          INSERT INTO approvals (tenant_id, user_id, work_area_id, item, status) VALUES
          (${tid}, ${uid}, ${wa1.id}, 'Banner designs v2', 'waiting'),
          (${tid}, ${uid}, ${wa1.id}, 'Campaign brief', 'approved'),
          (${tid}, ${uid}, ${wa2.id}, 'Brand Guidelines v3', 'approved');
        `;
      }
    }

    sendJson(res, 200, { message: 'Multi-tenant database schema created and seeded successfully' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
