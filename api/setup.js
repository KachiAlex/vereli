import { sendJson, handleCors } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        portal_on BOOLEAN NOT NULL DEFAULT false,
        portal_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`;
    await sql`UPDATE clients SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL`;

    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
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
    await sql`UPDATE invoices SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL`;

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

    // Seed demo data if tables are empty and at least one user exists
    const [clientCount] = await sql`SELECT COUNT(*)::int AS count FROM clients`;
    const [firstUser] = await sql`SELECT id FROM users ORDER BY id LIMIT 1`;
    if (clientCount.count === 0 && firstUser) {
      const uid = firstUser.id;
      const [c1] = await sql`
        INSERT INTO clients (user_id, name, contact, email, status, portal_on, portal_url)
        VALUES (${uid}, 'Meridian Advisory', 'Sarah Okafor', 'sarah@meridian.ng', 'active', true, 'https://vereli.kite.space/portal/meridian')
        RETURNING id;
      `;
      const [c2] = await sql`
        INSERT INTO clients (user_id, name, contact, email, status, portal_on)
        VALUES (${uid}, 'Nova Digital', 'Chidi Nwosu', 'chidi@novadigital.ng', 'active', false)
        RETURNING id;
      `;
      const [c3] = await sql`
        INSERT INTO clients (user_id, name, contact, email, status, portal_on)
        VALUES (${uid}, 'Lumina Studio', 'Amara Bello', 'amara@luminastudio.ng', 'inactive', false)
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

      await sql`
        INSERT INTO invoices (user_id, client_id, project_id, amount, currency, status, due_date)
        VALUES (${uid}, ${c1.id}, ${p3.id}, 900000, 'NGN', 'paid', '2025-03-15T00:00:00Z');
      `;
      await sql`
        INSERT INTO invoices (user_id, client_id, project_id, amount, currency, status, due_date)
        VALUES (${uid}, ${c2.id}, ${p2.id}, 900000, 'NGN', 'pending', '2025-06-15T00:00:00Z');
      `;
    }

    sendJson(res, 200, { message: 'Database schema created and seeded' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
