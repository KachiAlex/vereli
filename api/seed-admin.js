import { sendJson, handleCors } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    await sql`DELETE FROM users`;
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ('admin@vereli.com', 'admin123', 'Admin', 'admin')
      RETURNING id, email, name, role;
    `;
    sendJson(res, 200, { message: 'Users cleared. Admin seeded.', data: user });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
