import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  try {
    const users = await sql`
      SELECT id, email, name, role, tenant_id,
             CASE WHEN password_hash IS NOT NULL THEN 'yes' ELSE 'no' END as has_password,
             CASE WHEN LENGTH(password_hash) > 30 THEN 'bcrypt' ELSE 'plaintext' END as hash_type
      FROM users
      ORDER BY id;
    `;
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
