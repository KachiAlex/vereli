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

    // Seed demo data if tables are empty
    const [clientCount] = await sql`SELECT COUNT(*)::int AS count FROM clients`;
    if (clientCount.count === 0) {
      const [c1] = await sql`
        INSERT INTO clients (name, contact, email, status, portal_on, portal_url)
        VALUES ('Meridian Advisory', 'Sarah Okafor', 'sarah@meridian.ng', 'active', true, 'https://vereli.kite.space/portal/meridian')
        RETURNING id;
      `;
      const [c2] = await sql`
        INSERT INTO clients (name, contact, email, status, portal_on)
        VALUES ('Nova Digital', 'Chidi Nwosu', 'chidi@novadigital.ng', 'active', false)
        RETURNING id;
      `;
      const [c3] = await sql`
        INSERT INTO clients (name, contact, email, status, portal_on)
        VALUES ('Lumina Studio', 'Amara Bello', 'amara@luminastudio.ng', 'inactive', false)
        RETURNING id;
      `;

      const [p1] = await sql`
        INSERT INTO projects (client_id, name, status, budget, tasks_total, tasks_pending)
        VALUES (${c1.id}, 'Q3 Strategy Review', 'in_progress', 2500000, 8, 3)
        RETURNING id;
      `;
      const [p2] = await sql`
        INSERT INTO projects (client_id, name, status, budget, tasks_total, tasks_pending)
        VALUES (${c2.id}, 'Website Redesign', 'pending', 1800000, 12, 12)
        RETURNING id;
      `;
      const [p3] = await sql`
        INSERT INTO projects (client_id, name, status, budget, tasks_total, tasks_pending)
        VALUES (${c1.id}, 'Brand Audit', 'completed', 900000, 5, 0)
        RETURNING id;
      `;

      await sql`
        INSERT INTO invoices (client_id, project_id, amount, currency, status, due_date)
        VALUES (${c1.id}, ${p3.id}, 900000, 'NGN', 'paid', '2025-03-15T00:00:00Z');
      `;
      await sql`
        INSERT INTO invoices (client_id, project_id, amount, currency, status, due_date)
        VALUES (${c2.id}, ${p2.id}, 900000, 'NGN', 'pending', '2025-06-15T00:00:00Z');
      `;
    }

    sendJson(res, 200, { message: 'Database schema created and seeded' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
