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
    const { invoiceId } = req.query || {};
    let rows;
    
    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (invoiceId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE invoice_id = ${Number(invoiceId)} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE tenant_id = ${tid} AND invoice_id = ${Number(invoiceId)} ORDER BY created_at DESC`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, invoice_id, amount, currency, method, note, created_at FROM payments WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
        }
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
      sendJson(res, 500, { error: 'Failed to fetch payments' });
      return;
    }
    const data = rows.map(r => ({
      id: r.id,
      invoiceId: r.invoice_id,
      amount: r.amount,
      currency: r.currency,
      method: r.method,
      note: r.note,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to record payments' });
      return;
    }

    const { invoiceId, amount, currency = 'NGN', method, note } = req.body || {};
    if (!invoiceId || !amount) { badRequest(res, 'invoiceId and amount are required'); return; }
    
    // Verify invoice belongs to tenant
    const [invoice] = await sql`SELECT id FROM invoices WHERE id = ${Number(invoiceId)} AND tenant_id = ${tenantId}`;
    if (!invoice) {
      sendJson(res, 404, { error: 'Invoice not found in your workspace' });
      return;
    }
    
    const [row] = await sql`
      INSERT INTO payments (tenant_id, user_id, invoice_id, amount, currency, method, note)
      VALUES (${tenantId}, ${user.userId}, ${Number(invoiceId)}, ${Number(amount)}, ${currency}, ${method || null}, ${note || null})
      RETURNING id, invoice_id, amount, currency, method, note, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, invoiceId: row.invoice_id, amount: row.amount, currency: row.currency, method: row.method, note: row.note, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
