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
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (company !== undefined) { fields.push('company = $' + (fields.length + 1)); values.push(company); }

    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, email, name, company, role`;
    values.push(user.userId);

    let row;
    try {
      [row] = await sql(query, values);
    } catch (err) {
      // company column may not exist yet in old databases
      if (company !== undefined) {
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT`; } catch (_) {}
        try {
          [row] = await sql(query, values);
        } catch (_) {}
      }
      if (!row && name !== undefined) {
        [row] = await sql`UPDATE users SET name = ${name} WHERE id = ${user.userId} RETURNING id, email, name, role`;
      }
    }
    if (!row) { badRequest(res, 'Update failed'); return; }
    sendJson(res, 200, {
      data: {
        id: row.id,
        email: row.email,
        name: row.name,
        company: row.company || company || null,
        role: row.role,
      },
    });
    return;
  }

  badRequest(res, 'Method not allowed');
}
