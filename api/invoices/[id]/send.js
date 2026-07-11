import { sendJson, handleCors, badRequest, requireAuth } from '../../lib/utils.js';
import { sql } from '../../lib/neon.js';
import { canManageData } from '../../lib/auth.js';
import { sendEmail } from '../../lib/email.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') { badRequest(res, 'Method not allowed'); return; }

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'Invoice id required'); return; }

  const tenantId = user.tenantId;
  if (!tenantId && user.role !== 'superadmin') {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  if (!canManageData(user)) {
    sendJson(res, 403, { error: 'Insufficient permissions to send invoices' });
    return;
  }

  const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  const [invoice] = await sql`
    SELECT i.id, i.client_id, i.project_id, i.amount, i.currency, i.status, i.due_date, i.line_items, i.sent_at, i.paid_at, i.created_at,
           c.name AS client_name, c.email AS client_email, c.contact AS client_contact,
           p.name AS project_name
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE i.id = ${id} AND i.tenant_id = ${tid}
  `;
  if (!invoice) { sendJson(res, 404, { error: 'Invoice not found' }); return; }
  if (invoice.status === 'paid') { sendJson(res, 400, { error: 'Paid invoices cannot be sent' }); return; }

  const [row] = await sql`
    UPDATE invoices
    SET status = 'sent', sent_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at;
  `;

  const lineItems = Array.isArray(row.line_items) ? row.line_items : (typeof row.line_items === 'string' ? JSON.parse(row.line_items) : []);
  const itemsHtml = lineItems.length
    ? lineItems.map(item => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${item.description || item.desc || 'Item'}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${item.quantity || item.qty || 1}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${(item.amount || item.rate || 0).toLocaleString()}</td></tr>`).join('')
    : `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">Service</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">1</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${(row.amount || 0).toLocaleString()}</td></tr>`;

  const portalUrl = process.env.PORTAL_BASE_URL || 'https://vereli.vercel.app/portal';
  const payUrl = `${portalUrl}?invoice=${row.id}`;
  const pdfUrl = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vereli.vercel.app'}/api/invoices/${row.id}/pdf`;

  try {
    await sendEmail({
      to: invoice.client_email,
      subject: `Invoice #${row.id} from ${user.tenantName || 'Vereli'}`,
      html: `<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;color:#0B4F52;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 8px;font-size:22px;">Invoice #${row.id}</h2>
  <p style="color:#7A9E99;font-size:13px;margin:0 0 24px;">Issued ${new Date(row.created_at).toLocaleDateString()} · Due ${row.due_date ? new Date(row.due_date).toLocaleDateString() : 'N/A'}</p>
  <p>Hi ${invoice.client_name || 'there'},</p>
  <p>${user.tenantName || 'Your service provider'} has sent you an invoice for <strong>${row.currency || 'NGN'} ${(row.amount || 0).toLocaleString()}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead><tr><th style="text-align:left;border-bottom:2px solid #E2EBE9;padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8E9E9E;">Description</th><th style="text-align:right;border-bottom:2px solid #E2EBE9;padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8E9E9E;">Qty</th><th style="text-align:right;border-bottom:2px solid #E2EBE9;padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8E9E9E;">Amount</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <p style="text-align:right;font-size:18px;font-weight:700;">Total: ${row.currency || 'NGN'} ${(row.amount || 0).toLocaleString()}</p>
  <div style="margin:28px 0;text-align:center;">
    <a href="${payUrl}" style="display:inline-block;padding:12px 24px;background:#0B4F52;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">Pay now</a>
    <a href="${pdfUrl}" style="display:inline-block;padding:12px 24px;background:#E2EBE9;color:#0B4F52;text-decoration:none;border-radius:10px;font-weight:700;margin-left:10px;">View invoice</a>
  </div>
  <p style="font-size:12px;color:#8E9E9E;margin-top:32px;">You can also pay through your client portal at ${portalUrl}</p>
</body>
</html>`,
      text: `Invoice #${row.id} from ${user.tenantName || 'Vereli'}\nAmount: ${row.currency || 'NGN'} ${(row.amount || 0).toLocaleString()}\nPay now: ${payUrl}\nView invoice: ${pdfUrl}`
    });
  } catch (err) {
    console.error('Failed to send invoice email:', err);
  }

  sendJson(res, 200, { data: {
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
    clientName: invoice.client_name,
    clientEmail: invoice.client_email
  }});
}
