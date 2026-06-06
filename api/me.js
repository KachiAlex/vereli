import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    sendJson(res, 200, {
      data: {
        id: user.userId,
        email: user.email,
        name: user.name,
        company: user.company,
        role: user.role,
      },
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, company } = req.body || {};
    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (company !== undefined) updates.push(sql`company = ${company}`);

    if (updates.length === 0) { badRequest(res, 'No fields to update'); return; }

    const [row] = await sql`
      UPDATE users SET ${sql.join(updates, sql`, `)} WHERE id = ${user.userId}
      RETURNING id, email, name, company, role;
    `;
    sendJson(res, 200, {
      data: {
        id: row.id,
        email: row.email,
        name: row.name,
        company: row.company,
        role: row.role,
      },
    });
    return;
  }

  badRequest(res, 'Method not allowed');
}
