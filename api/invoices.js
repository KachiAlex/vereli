import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    let rows;

    if (clientId && status) {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, created_at FROM invoices WHERE client_id = ${Number(clientId)} AND status = ${status}`;
    } else if (clientId) {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, created_at FROM invoices WHERE client_id = ${Number(clientId)}`;
    } else if (status) {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, created_at FROM invoices WHERE status = ${status}`;
    } else {
      rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, created_at FROM invoices`;
    }

    const data = rows.map(r => ({
      id: r.id,
      clientId: r.client_id,
      projectId: r.project_id,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      dueDate: r.due_date,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { clientId, projectId, amount, currency = 'NGN', dueDate, status = 'pending' } = req.body || {};
    if (!clientId || !projectId || !amount || !dueDate) {
      badRequest(res, 'clientId, projectId, amount, and dueDate are required');
      return;
    }
    const [row] = await sql`
      INSERT INTO invoices (client_id, project_id, amount, currency, status, due_date)
      VALUES (${Number(clientId)}, ${Number(projectId)}, ${Number(amount)}, ${currency}, ${status}, ${dueDate})
      RETURNING id, client_id, project_id, amount, currency, status, due_date, created_at;
    `;
    const invoice = {
      id: row.id,
      clientId: row.client_id,
      projectId: row.project_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      dueDate: row.due_date,
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: invoice });
    return;
  }

  badRequest(res, 'Method not allowed');
}
