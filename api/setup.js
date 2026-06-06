import { sendJson, handleCors } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    // Users must be created first (referenced by other tables)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'Service',
        status TEXT NOT NULL DEFAULT 'active',
        portal_on BOOLEAN NOT NULL DEFAULT false,
        portal_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Service'`;
    await sql`UPDATE clients SET type = 'Service' WHERE type IS NULL OR type = ''`;

    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        budget INTEGER NOT NULL DEFAULT 0,
        tasks_total INTEGER NOT NULL DEFAULT 0,
        tasks_pending INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`;
    await sql`UPDATE projects SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL`;

    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        status TEXT NOT NULL DEFAULT 'pending',
        due_date TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
    await sql`UPDATE invoices SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL`;

    await sql`
      CREATE TABLE IF NOT EXISTS work_areas (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'active',
        progress INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false,
        assignee TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'document',
        size TEXT,
        visibility TEXT NOT NULL DEFAULT 'internal',
        uploader_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    await sql`
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
        item TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Seed demo data if tables are empty and at least one user exists
    const [clientCount] = await sql`SELECT COUNT(*)::int AS count FROM clients`;
    const [firstUser] = await sql`SELECT id FROM users ORDER BY id LIMIT 1`;
    if (clientCount.count === 0 && firstUser) {
      const uid = firstUser.id;
      const [c1] = await sql`
        INSERT INTO clients (user_id, name, contact, email, type, status, portal_on, portal_url)
        VALUES (${uid}, 'Meridian Advisory', 'Sarah Okafor', 'sarah@meridian.ng', 'Advisory', 'active', true, 'https://vereli.kite.space/portal/meridian')
        RETURNING id;
      `;
      const [c2] = await sql`
        INSERT INTO clients (user_id, name, contact, email, type, status, portal_on)
        VALUES (${uid}, 'Nova Digital', 'Chidi Nwosu', 'chidi@novadigital.ng', 'Brand & Marketing', 'active', false)
        RETURNING id;
      `;
      const [c3] = await sql`
        INSERT INTO clients (user_id, name, contact, email, type, status, portal_on)
        VALUES (${uid}, 'Lumina Studio', 'Amara Bello', 'amara@luminastudio.ng', 'Design Project', 'inactive', false)
        RETURNING id;
      `;

      const [p1] = await sql`
        INSERT INTO projects (user_id, client_id, name, status, budget, tasks_total, tasks_pending)
        VALUES (${uid}, ${c1.id}, 'Q3 Strategy Review', 'in_progress', 2500000, 8, 3)
        RETURNING id;
      `;
      const [p2] = await sql`
        INSERT INTO projects (user_id, client_id, name, status, budget, tasks_total, tasks_pending)
        VALUES (${uid}, ${c2.id}, 'Website Redesign', 'pending', 1800000, 12, 12)
        RETURNING id;
      `;
      const [p3] = await sql`
        INSERT INTO projects (user_id, client_id, name, status, budget, tasks_total, tasks_pending)
        VALUES (${uid}, ${c1.id}, 'Brand Audit', 'completed', 900000, 5, 0)
        RETURNING id;
      `;

      const [inv1] = await sql`
        INSERT INTO invoices (user_id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at)
        VALUES (${uid}, ${c1.id}, ${p3.id}, 900000, 'NGN', 'paid', '2025-03-15T00:00:00Z',
          '[{"desc":"Brand Audit","qty":1,"rate":900000}]'::jsonb, '2025-03-01T00:00:00Z', '2025-03-10T00:00:00Z')
        RETURNING id;
      `;
      const [inv2] = await sql`
        INSERT INTO invoices (user_id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at)
        VALUES (${uid}, ${c2.id}, ${p2.id}, 1800000, 'NGN', 'sent', '2025-06-15T00:00:00Z',
          '[{"desc":"Website Design","qty":1,"rate":1200000},{"desc":"Development","qty":1,"rate":600000}]'::jsonb, '2025-05-20T00:00:00Z')
        RETURNING id;
      `;
      await sql`
        INSERT INTO payments (user_id, invoice_id, amount, currency, method, note)
        VALUES (${uid}, ${inv1.id}, 900000, 'NGN', 'Bank transfer', 'Full payment received');
      `;

      // Seed work areas, tasks, files for c1 (Meridian)
      const [wa1] = await sql`
        INSERT INTO work_areas (user_id, client_id, name, type, status, progress)
        VALUES (${uid}, ${c1.id}, 'Q3 Campaign', 'marketing', 'active', 65)
        RETURNING id;
      `;
      const [wa2] = await sql`
        INSERT INTO work_areas (user_id, client_id, name, type, status, progress)
        VALUES (${uid}, ${c1.id}, 'Brand Guidelines', 'design', 'active', 30)
        RETURNING id;
      `;
      await sql`
        INSERT INTO tasks (user_id, work_area_id, text, done, assignee, status, priority) VALUES
        (${uid}, ${wa1.id}, 'Write creative brief', true, 'You', 'completed', 'high'),
        (${uid}, ${wa1.id}, 'Design banner ads', false, 'You', 'in-progress', 'high'),
        (${uid}, ${wa1.id}, 'Review with client', false, null, 'todo', 'medium'),
        (${uid}, ${wa2.id}, 'Compile logo variants', false, 'You', 'in-progress', 'medium');
      `;
      await sql`
        INSERT INTO files (user_id, work_area_id, name, type, size, visibility, uploader_name) VALUES
        (${uid}, ${wa1.id}, 'Creative-brief-v2.pdf', 'PDF', '1.2 MB', 'shared', 'You'),
        (${uid}, ${wa2.id}, 'Logo-explorations.fig', 'Figma', '4.5 MB', 'internal', 'You');
      `;
      await sql`
        INSERT INTO comments (user_id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference) VALUES
        (${uid}, ${wa1.id}, 'Sarah Okafor', 'SO', '#E4F2F0', '#0B4F52', 'Love the direction — can we use this style throughout?', 'Creative-brief-v2.pdf'),
        (${uid}, ${wa2.id}, 'Sarah Okafor', 'SO', '#E4F2F0', '#0B4F52', 'Colours adjusted — perfect now.', 'Logo-explorations.fig');
      `;
      await sql`
        INSERT INTO approvals (user_id, work_area_id, item, status) VALUES
        (${uid}, ${wa1.id}, 'Banner designs v2', 'waiting'),
        (${uid}, ${wa1.id}, 'Campaign brief', 'approved'),
        (${uid}, ${wa2.id}, 'Brand Guidelines v3', 'approved');
      `;
    }

    sendJson(res, 200, { message: 'Database schema created and seeded' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
