import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { requireClientAuth } from './auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const client = await requireClientAuth(req, res);
  if (!client) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const clientId = client.clientId;

  try {
    // Ensure columns exist
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_logo TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_banner TEXT`;
    await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS url TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id INTEGER`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_initials TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_bg TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_tc TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS reference TEXT`;

    // Fetch client details
    const [clientRow] = await sql`SELECT id, name, contact, email, portal_on, portal_url, portal_logo, portal_banner, tenant_id FROM clients WHERE id = ${clientId}`;
    if (!clientRow) {
      sendJson(res, 404, { error: 'Client not found' });
      return;
    }

    // Fetch tenant payment gateway settings
    let paymentGateways = {};
    if (clientRow.tenant_id) {
      const [tenant] = await sql`SELECT settings FROM tenants WHERE id = ${clientRow.tenant_id}`;
      const settings = tenant?.settings || {};
      const gwSettings = settings.paymentGateways || {};
      const fwConfigured = !!(process.env.FLUTTERWAVE_SECRET_KEY && process.env.FLUTTERWAVE_PUBLIC_KEY);
      const psConfigured = !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PUBLIC_KEY);
      const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
      paymentGateways = {
        flutterwave: { enabled: gwSettings.flutterwave?.enabled && fwConfigured, publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '' },
        paystack: { enabled: gwSettings.paystack?.enabled && psConfigured, publicKey: process.env.PAYSTACK_PUBLIC_KEY || '' },
        stripe: { enabled: gwSettings.stripe?.enabled && stripeConfigured },
      };
    }

    // Fetch related data
    const workAreas = await sql`SELECT id, client_id, name, type, status, progress, created_at FROM work_areas WHERE client_id = ${clientId} ORDER BY created_at DESC`;
    const workAreaIds = workAreas.map(wa => wa.id);

    let tasks = [], files = [], comments = [], approvals = [], invoices = [];
    if (workAreaIds.length > 0) {
      tasks = await sql`SELECT id, work_area_id, text, done, assignee, status, priority, created_at FROM tasks WHERE work_area_id IN (${workAreaIds}) ORDER BY created_at`;
      files = await sql`SELECT id, work_area_id, name, type, size, visibility, uploader_name, url, created_at FROM files WHERE work_area_id IN (${workAreaIds}) ORDER BY created_at DESC`;
      comments = await sql`SELECT id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE work_area_id IN (${workAreaIds}) ORDER BY created_at DESC`;
      approvals = await sql`SELECT id, work_area_id, item, status, created_at FROM approvals WHERE work_area_id IN (${workAreaIds}) ORDER BY created_at DESC`;
    }
    invoices = await sql`SELECT id, client_id, project_id, amount, currency, status, due_date, line_items, sent_at, paid_at, created_at FROM invoices WHERE client_id = ${clientId} ORDER BY created_at DESC`;

    sendJson(res, 200, {
      data: {
        paymentGateways,
        client: {
          id: clientRow.id,
          name: clientRow.name,
          contact: clientRow.contact,
          email: clientRow.email,
          portal: {
            on: clientRow.portal_on,
            url: clientRow.portal_url,
            logo: clientRow.portal_logo,
            banner: clientRow.portal_banner,
          },
        },
        workAreas: workAreas.map(r => ({
          id: r.id,
          clientId: r.client_id,
          name: r.name,
          type: r.type,
          status: r.status,
          progress: r.progress,
          createdAt: r.created_at,
        })),
        tasks: tasks.map(r => ({
          id: r.id,
          workAreaId: r.work_area_id,
          text: r.text,
          done: r.done,
          assignee: r.assignee,
          status: r.status,
          priority: r.priority,
          createdAt: r.created_at,
        })),
        files: files.map(r => ({
          id: r.id,
          workAreaId: r.work_area_id,
          name: r.name,
          type: r.type,
          size: r.size,
          visibility: r.visibility,
          uploaderName: r.uploader_name,
          url: r.url,
          createdAt: r.created_at,
        })),
        comments: comments.map(r => ({
          id: r.id,
          workAreaId: r.work_area_id,
          parentId: r.parent_id,
          authorName: r.author_name,
          authorInitials: r.author_initials,
          authorBg: r.author_bg,
          authorTc: r.author_tc,
          text: r.text,
          reference: r.reference,
          createdAt: r.created_at,
        })),
        approvals: approvals.map(r => ({
          id: r.id,
          workAreaId: r.work_area_id,
          item: r.item,
          status: r.status,
          createdAt: r.created_at,
        })),
        invoices: invoices.map(r => ({
          id: r.id,
          clientId: r.client_id,
          projectId: r.project_id,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
          dueDate: r.due_date,
          lineItems: r.line_items || [],
          sentAt: r.sent_at,
          paidAt: r.paid_at,
          createdAt: r.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('Error fetching portal data:', err);
    sendJson(res, 500, { error: 'Failed to fetch portal data' });
  }
}
