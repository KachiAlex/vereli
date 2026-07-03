// Standalone script to re-seed the superadmin account
// Usage: node scripts/seed-admin.js

import { neon } from '@neondatabase/serverless';
import bcryptjs from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  try {
    const email = 'admin@vereli.com';
    const password = 'admin123';
    const passwordHash = await bcryptjs.hash(password, 12);

    // Check if user exists
    const [existing] = await sql`SELECT id, role FROM users WHERE email = ${email}`;

    if (existing) {
      // Update password and ensure superadmin role
      await sql`UPDATE users SET password_hash = ${passwordHash}, role = 'superadmin', tenant_id = NULL WHERE id = ${existing.id}`;
      console.log(`Updated admin account: ${email} / ${password}`);
    } else {
      // Create new superadmin
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, role, tenant_id)
        VALUES (${email}, ${passwordHash}, 'Super Admin', 'superadmin', NULL)
        RETURNING id, email, name, role;
      `;
      console.log(`Created admin account: ${email} / ${password}`);
      console.log('User:', user);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
