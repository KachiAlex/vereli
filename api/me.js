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

    let row;
    try {
      [row] = await sql`
        UPDATE users SET ${sql.join(updates, sql`, `)} WHERE id = ${user.userId}
        RETURNING id, email, name, company, role;
      `;
    } catch (err) {
      // company column may not exist yet in old databases
      if (company !== undefined) {
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT`; } catch (_) {}
        // Retry the full update now that column exists
        try {
          [row] = await sql`
            UPDATE users SET ${sql.join(updates, sql`, `)} WHERE id = ${user.userId}
            RETURNING id, email, name, company, role;
          `;
        } catch (_) {}
      }
      if (!row) {
        const safeUpdates = updates.filter(u => !u.sql || !u.sql.includes || !u.sql.includes('company'));
        if (safeUpdates.length === 0) { badRequest(res, 'No valid fields to update'); return; }
        [row] = await sql`
          UPDATE users SET ${sql.join(safeUpdates, sql`, `)} WHERE id = ${user.userId}
          RETURNING id, email, name, role;
        `;
      }
    }
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
