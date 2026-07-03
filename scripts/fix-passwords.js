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
    // Find all users with short/plaintext passwords (bcrypt hashes are 60 chars)
    const users = await sql`
      SELECT id, email, password_hash
      FROM users
      WHERE LENGTH(password_hash) < 30;
    `;

    console.log(`Found ${users.length} users with plaintext passwords:`);
    for (const u of users) {
      console.log(`  - ${u.email}`);
    }

    if (users.length === 0) {
      console.log('All passwords are already bcrypt hashed. Nothing to do.');
      process.exit(0);
    }

    for (const u of users) {
      const newHash = await bcryptjs.hash(u.password_hash, 12);
      await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${u.id}`;
      console.log(`  -> Re-hashed ${u.email}`);
    }

    console.log('Done. All passwords now use bcrypt.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
