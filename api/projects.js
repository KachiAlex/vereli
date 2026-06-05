import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    let rows;

    if (clientId && status) {
      rows = await sql`SELECT id, client_id, name, status, budget, tasks_total, tasks_pending, created_at FROM projects WHERE client_id = ${Number(clientId)} AND status = ${status}`;
    } else if (clientId) {
      rows = await sql`SELECT id, client_id, name, status, budget, tasks_total, tasks_pending, created_at FROM projects WHERE client_id = ${Number(clientId)}`;
    } else if (status) {
      rows = await sql`SELECT id, client_id, name, status, budget, tasks_total, tasks_pending, created_at FROM projects WHERE status = ${status}`;
    } else {
      rows = await sql`SELECT id, client_id, name, status, budget, tasks_total, tasks_pending, created_at FROM projects`;
    }

    const data = rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      status: r.status,
      budget: r.budget,
      tasksTotal: r.tasks_total,
      tasksPending: r.tasks_pending,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { clientId, name, budget, status = 'pending' } = req.body || {};
    if (!clientId || !name) {
      badRequest(res, 'clientId and name are required');
      return;
    }
    const [row] = await sql`
      INSERT INTO projects (client_id, name, budget, status)
      VALUES (${Number(clientId)}, ${name}, ${Number(budget) || 0}, ${status})
      RETURNING id, client_id, name, status, budget, tasks_total, tasks_pending, created_at;
    `;
    const project = {
      id: row.id,
      clientId: row.client_id,
      name: row.name,
      status: row.status,
      budget: row.budget,
      tasksTotal: row.tasks_total,
      tasksPending: row.tasks_pending,
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: project });
    return;
  }

  badRequest(res, 'Method not allowed');
}
