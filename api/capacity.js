import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const tenantId = user.tenantId;
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS timesheets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        task_id INTEGER,
        project_id INTEGER,
        client_id INTEGER,
        description TEXT,
        hours NUMERIC(4,2) NOT NULL,
        logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
        billable BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Aggregate hours by user for current month
    const rows = await sql`
      SELECT 
        u.id, u.name, u.email, u.role,
        COALESCE(SUM(t.hours), 0) as total_hours,
        COALESCE(SUM(CASE WHEN t.billable THEN t.hours ELSE 0 END), 0) as billable_hours,
        COUNT(DISTINCT t.id) as entry_count
      FROM users u
      LEFT JOIN timesheets t ON u.id = t.user_id 
        AND t.logged_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND t.logged_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      WHERE u.tenant_id = ${targetTenantId} AND u.role != 'superadmin'
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY total_hours DESC
    `;

    const data = rows.map(r => ({
      userId: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      totalHours: Number(r.total_hours),
      billableHours: Number(r.billable_hours),
      entryCount: Number(r.entry_count),
    }));

    sendJson(res, 200, { data });
  } catch (err) {
    console.error('Capacity error:', err);
    sendJson(res, 500, { error: 'Failed to fetch capacity data' });
  }
}
