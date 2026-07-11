import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // Check tenant access
  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned to user' });
    return;
  }

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    let rows;

    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (clientId && status) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE client_id = ${Number(clientId)} AND status = ${status}`;
        } else {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE tenant_id = ${tid} AND client_id = ${Number(clientId)} AND status = ${status}`;
        }
      } else if (clientId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE client_id = ${Number(clientId)}`;
        } else {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE tenant_id = ${tid} AND client_id = ${Number(clientId)}`;
        }
      } else if (status) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE status = ${status}`;
        } else {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE tenant_id = ${tid} AND status = ${status}`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices`;
        } else {
          rows = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE tenant_id = ${tid}`;
        }
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      sendJson(res, 500, { error: 'Failed to fetch invoices' });
      return;
    }

    const data = rows.map(r => {
      const isOverdue = r.status === 'sent' && r.due_date && new Date(r.due_date) < new Date();
      return {
        id: r.id,
        clientId: r.client_id,
        projectId: r.project_id,
        amount: r.amount,
        currency: r.currency,
        status: isOverdue ? 'overdue' : r.status,
        storedStatus: r.status,
        dueDate: r.due_date,
        lineItems: r.line_items || [],
        sentAt: r.sent_at,
        paidAt: r.paid_at,
        createdAt: r.created_at,
      };
    });
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to create invoices' });
      return;
    }

    const { clientId, projectId, amount, currency = 'NGN', dueDate, status = 'draft', lineItems } = req.body || {};
    const allowedStatuses = ['draft', 'sent', 'paid', 'overdue'];
    if (!clientId || !projectId || !amount || !dueDate) {
      badRequest(res, 'clientId, projectId, amount, and dueDate are required');
      return;
    }
    if (!allowedStatuses.includes(status)) {
      badRequest(res, 'Invalid invoice status');
      return;
    }
    
    // Verify client and project belong to tenant
    const [client] = await sql`SELECT id FROM clients WHERE id = ${Number(clientId)} AND tenant_id = ${tenantId}`;
    if (!client) {
      sendJson(res, 404, { error: 'Client not found in your workspace' });
      return;
    }
    
    const [project] = await sql`SELECT id FROM projects WHERE id = ${Number(projectId)} AND tenant_id = ${tenantId}`;
    if (!project) {
      sendJson(res, 404, { error: 'Project not found in your workspace' });
      return;
    }
    
    const li = lineItems ? JSON.stringify(lineItems) : null;
    const [row] = await sql`
      INSERT INTO invoices (tenant_id, user_id, client_id, project_id, amount, currency, status, due_date, line_items)
      VALUES (${tenantId}, ${user.userId}, ${Number(clientId)}, ${Number(projectId)}, ${Number(amount)}, ${currency}, ${status}, ${dueDate}, ${li})
      RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at;
    `;
    const invoice = {
      id: row.id,
      clientId: row.client_id,
      projectId: row.project_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      dueDate: row.due_date,
      lineItems: row.line_items || [],
      sentAt: row.sent_at,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
    sendJson(res, 201, { data: invoice });
    return;
  }

  badRequest(res, 'Method not allowed');
}
