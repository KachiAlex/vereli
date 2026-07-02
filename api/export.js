import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

function toCsv(rows, headers) {
  if (!rows.length) return '';
  const lines = [headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { type = 'clients', format = 'json' } = req.query || {};
  const tenantId = user.tenantId;
  const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  try {
    let data = [];
    let filename = '';

    if (type === 'clients') {
      filename = 'clients.csv';
      const rows = await sql`SELECT id, name, email, contact, type, status, created_at FROM clients WHERE tenant_id = ${tid} ORDER BY name`;
      data = rows.map(r => ({ id: r.id, name: r.name, email: r.email, contact: r.contact, type: r.type, status: r.status, createdAt: r.created_at }));
    } else if (type === 'invoices') {
      filename = 'invoices.csv';
      const rows = await sql`SELECT id, client_id, amount, currency, status, due_date, created_at FROM invoices WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
      data = rows.map(r => ({ id: r.id, clientId: r.client_id, amount: r.amount, currency: r.currency, status: r.status, dueDate: r.due_date, createdAt: r.created_at }));
    } else if (type === 'projects') {
      filename = 'projects.csv';
      const rows = await sql`SELECT id, client_id, name, status, budget, created_at FROM projects WHERE tenant_id = ${tid} ORDER BY name`;
      data = rows.map(r => ({ id: r.id, clientId: r.client_id, name: r.name, status: r.status, budget: r.budget, createdAt: r.created_at }));
    } else if (type === 'payments') {
      filename = 'payments.csv';
      const rows = await sql`SELECT id, invoice_id, amount, currency, method, created_at FROM payments WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
      data = rows.map(r => ({ id: r.id, invoiceId: r.invoice_id, amount: r.amount, currency: r.currency, method: r.method, createdAt: r.created_at }));
    } else {
      badRequest(res, 'Invalid export type');
      return;
    }

    if (format === 'csv') {
      const headers = Object.keys(data[0] || {});
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(toCsv(data, headers));
      return;
    }

    sendJson(res, 200, { data });
  } catch (err) {
    console.error('Export error:', err);
    sendJson(res, 500, { error: 'Export failed' });
  }
}
