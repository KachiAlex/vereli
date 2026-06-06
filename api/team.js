import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const rows = await sql`SELECT id, email, name, role, status, created_at FROM team_members WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
    const data = rows.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { email, name, role = 'member' } = req.body || {};
    if (!email) { badRequest(res, 'email is required'); return; }
    const [existing] = await sql`SELECT id FROM team_members WHERE user_id = ${user.userId} AND email = ${email.toLowerCase()}`;
    if (existing) { badRequest(res, 'Team member already invited'); return; }
    const [row] = await sql`
      INSERT INTO team_members (user_id, email, name, role, status)
      VALUES (${user.userId}, ${email.toLowerCase()}, ${name || null}, ${role}, 'invited')
      RETURNING id, email, name, role, status, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
