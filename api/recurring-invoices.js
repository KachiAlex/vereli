import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS recurring_invoices (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      frequency TEXT NOT NULL DEFAULT 'monthly',
      line_items JSONB DEFAULT '[]',
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE,
      next_run_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT id, client_id, name, amount, currency, frequency, line_items, start_date, end_date, next_run_date, status, created_at FROM recurring_invoices WHERE tenant_id = ${targetTenantId} ORDER BY created_at DESC`;
      const data = rows.map(r => ({
        id: r.id,
        clientId: r.client_id,
        name: r.name,
        amount: Number(r.amount),
        currency: r.currency,
        frequency: r.frequency,
        lineItems: r.line_items || [],
        startDate: r.start_date,
        endDate: r.end_date,
        nextRunDate: r.next_run_date,
        status: r.status,
        createdAt: r.created_at,
      }));
      sendJson(res, 200, { data });
    } catch (err) {
      console.error('Error fetching recurring invoices:', err);
      sendJson(res, 500, { error: 'Failed to fetch recurring invoices' });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions' });
      return;
    }

    const { clientId, name, amount, currency = 'NGN', frequency = 'monthly', lineItems, startDate, endDate } = req.body || {};
    if (!name || amount === undefined) {
      badRequest(res, 'name and amount are required');
      return;
    }

    try {
      const [row] = await sql`
        INSERT INTO recurring_invoices (tenant_id, client_id, name, amount, currency, frequency, line_items, start_date, end_date, next_run_date)
        VALUES (${targetTenantId}, ${clientId || null}, ${name}, ${Number(amount)}, ${currency}, ${frequency}, ${JSON.stringify(lineItems || [])}, ${startDate || 'CURRENT_DATE'}, ${endDate || null}, ${startDate || 'CURRENT_DATE'})
        RETURNING id, client_id, name, amount, currency, frequency, line_items, start_date, end_date, next_run_date, status, created_at;
      `;
      sendJson(res, 201, {
        data: {
          id: row.id,
          clientId: row.client_id,
          name: row.name,
          amount: Number(row.amount),
          currency: row.currency,
          frequency: row.frequency,
          lineItems: row.line_items || [],
          startDate: row.start_date,
          endDate: row.end_date,
          nextRunDate: row.next_run_date,
          status: row.status,
          createdAt: row.created_at,
        }
      });
    } catch (err) {
      console.error('Error creating recurring invoice:', err);
      sendJson(res, 500, { error: 'Failed to create recurring invoice' });
    }
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { id } = req.query || {};
    if (!id) { badRequest(res, 'id is required'); return; }

    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions' });
      return;
    }

    const { name, amount, currency, frequency, lineItems, startDate, endDate, nextRunDate, status } = req.body || {};
    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = $' + (fields.length + 1)); values.push(name); }
    if (amount !== undefined) { fields.push('amount = $' + (fields.length + 1)); values.push(Number(amount)); }
    if (currency !== undefined) { fields.push('currency = $' + (fields.length + 1)); values.push(currency); }
    if (frequency !== undefined) { fields.push('frequency = $' + (fields.length + 1)); values.push(frequency); }
    if (lineItems !== undefined) { fields.push('line_items = $' + (fields.length + 1)); values.push(JSON.stringify(lineItems)); }
    if (startDate !== undefined) { fields.push('start_date = $' + (fields.length + 1)); values.push(startDate); }
    if (endDate !== undefined) { fields.push('end_date = $' + (fields.length + 1)); values.push(endDate); }
    if (nextRunDate !== undefined) { fields.push('next_run_date = $' + (fields.length + 1)); values.push(nextRunDate); }
    if (status !== undefined) { fields.push('status = $' + (fields.length + 1)); values.push(status); }

    if (fields.length === 0) { badRequest(res, 'No fields to update'); return; }

    const query = user.role === 'superadmin'
      ? `UPDATE recurring_invoices SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id, client_id, name, amount, currency, frequency, line_items, start_date, end_date, next_run_date, status, created_at`
      : `UPDATE recurring_invoices SET ${fields.join(', ')} WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING id, client_id, name, amount, currency, frequency, line_items, start_date, end_date, next_run_date, status, created_at`;
    values.push(Number(id));
    if (user.role !== 'superadmin') values.push(targetTenantId);

    try {
      const [row] = await sql(query, values);
      if (!row) { sendJson(res, 404, { error: 'Not found' }); return; }
      sendJson(res, 200, {
        data: {
          id: row.id,
          clientId: row.client_id,
          name: row.name,
          amount: Number(row.amount),
          currency: row.currency,
          frequency: row.frequency,
          lineItems: row.line_items || [],
          startDate: row.start_date,
          endDate: row.end_date,
          nextRunDate: row.next_run_date,
          status: row.status,
          createdAt: row.created_at,
        }
      });
    } catch (err) {
      console.error('Error updating recurring invoice:', err);
      sendJson(res, 500, { error: 'Failed to update' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) { badRequest(res, 'id is required'); return; }

    try {
      const [row] = user.role === 'superadmin'
        ? await sql`DELETE FROM recurring_invoices WHERE id = ${Number(id)} RETURNING id`
        : await sql`DELETE FROM recurring_invoices WHERE id = ${Number(id)} AND tenant_id = ${targetTenantId} RETURNING id`;
      if (!row) { sendJson(res, 404, { error: 'Not found' }); return; }
      sendJson(res, 200, { message: 'Recurring invoice deleted' });
    } catch (err) {
      console.error('Error deleting recurring invoice:', err);
      sendJson(res, 500, { error: 'Failed to delete' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
