import { sendJson, handleCors, badRequest, notFound, requireAuth } from '../../lib/utils.js';
import { sql } from '../../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const id = Number(req.query.id);
  if (!id) { badRequest(res, 'id is required'); return; }

  try {
    const [row] = user.role === 'superadmin'
      ? await sql`SELECT i.*, c.name as client_name, c.email as client_email, c.contact as client_contact FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.id = ${id}`
      : await sql`SELECT i.*, c.name as client_name, c.email as client_email, c.contact as client_contact FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.id = ${id} AND i.tenant_id = ${user.tenantId}`;

    if (!row) { notFound(res); return; }

    const lineItems = Array.isArray(row.line_items) ? row.line_items : (typeof row.line_items === 'string' ? JSON.parse(row.line_items) : []);
    const itemsHtml = lineItems.length
      ? lineItems.map(item => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${item.description || 'Item'}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${item.quantity || 1}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${(item.amount || 0).toLocaleString()}</td></tr>`).join('')
      : '<tr><td style="padding:10px 0;border-bottom:1px solid #eee">Service</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">1</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">' + (row.amount || 0).toLocaleString() + '</td></tr>';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice #${row.id}</title>
  <style>
    body { font-family: 'Inter', sans-serif; color: #0B4F52; max-width: 720px; margin: 40px auto; padding: 40px; background: #fff; }
    h1 { font-family: 'General Sans', sans-serif; font-size: 28px; margin: 0 0 8px; }
    .meta { color: #7A9E99; font-size: 13px; margin-bottom: 32px; }
    .from-to { display: flex; justify-content: space-between; margin-bottom: 32px; }
    .block { font-size: 13px; line-height: 1.6; }
    .block strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8E9E9E; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8E9E9E; padding: 8px 0; border-bottom: 2px solid #E2EBE9; }
    .total { margin-top: 24px; text-align: right; font-size: 18px; font-weight: 700; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: ${row.status === 'paid' ? '#E4F5ED' : row.status === 'sent' ? '#FEF4E0' : '#EEF3F2'}; color: ${row.status === 'paid' ? '#1A6B4A' : row.status === 'sent' ? '#8C5208' : '#5A7872'}; }
    @media print { body { margin: 0; padding: 24px; } }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div>
      <h1>Invoice #${row.id}</h1>
      <div class="meta">${row.status ? `<span class="status">${row.status}</span> · ` : ''}Issued ${new Date(row.created_at).toLocaleDateString()} · Due ${row.due_date ? new Date(row.due_date).toLocaleDateString() : 'N/A'}</div>
    </div>
    <div style="text-align:right;font-size:13px;color:#0B4F52;font-weight:700">${row.currency || 'NGN'} ${(row.amount || 0).toLocaleString()}</div>
  </div>
  <div class="from-to">
    <div class="block"><strong>Bill to</strong>${row.client_name || '—'}<br>${row.client_email || ''}<br>${row.client_contact || ''}</div>
    <div class="block" style="text-align:right"><strong>From</strong>${user.tenantName || 'Your Workspace'}</div>
  </div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="total">Total: ${row.currency || 'NGN'} ${(row.amount || 0).toLocaleString()}</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (err) {
    console.error('Invoice PDF error:', err);
    sendJson(res, 500, { error: 'Failed to generate invoice' });
  }
}
