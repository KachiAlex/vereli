import { sendJson, handleCors, badRequest, requireAuth } from '../../lib/utils.js';
import { sql } from '../../lib/neon.js';
import { canViewData } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') { badRequest(res, 'Method not allowed'); return; }

  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canViewData(user)) { sendJson(res, 403, { error: 'Forbidden' }); return; }

  const clientId = Number(req.query.id);
  if (!clientId) { badRequest(res, 'Invalid client ID'); return; }

  const tenantId = user.tenantId;

  // Verify client belongs to tenant
  const [client] = await sql`SELECT id FROM clients WHERE id = ${clientId} AND tenant_id = ${tenantId}`;
  if (!client) { sendJson(res, 404, { error: 'Client not found' }); return; }

  // Get work areas for this client to filter related entities
  const workAreas = await sql`SELECT id FROM work_areas WHERE client_id = ${clientId}`;
  const workAreaIds = workAreas.map(w => w.id);
  const waList = workAreaIds.length > 0 ? workAreaIds.join(',') : '0';

  // Fetch activities from multiple tables
  const activities = [];

  // Tasks
  const tasks = await sql`
    SELECT id, text, status, priority, assignee, created_at, updated_at
    FROM tasks WHERE work_area_id = ANY(${workAreaIds}) ORDER BY created_at DESC LIMIT 50
  `;
  tasks.forEach(t => activities.push({
    type: 'task', id: t.id, title: t.text, status: t.status, priority: t.priority,
    assignee: t.assignee, createdAt: t.created_at, updatedAt: t.updated_at,
  }));

  // Files
  const files = await sql`
    SELECT id, name, type, visibility, uploader_name, created_at
    FROM files WHERE work_area_id = ANY(${workAreaIds}) ORDER BY created_at DESC LIMIT 50
  `;
  files.forEach(f => activities.push({
    type: 'file', id: f.id, title: f.name, fileType: f.type, visibility: f.visibility,
    uploader: f.uploader_name, createdAt: f.created_at,
  }));

  // Comments
  const comments = await sql`
    SELECT id, text, author_name, created_at
    FROM comments WHERE work_area_id = ANY(${workAreaIds}) ORDER BY created_at DESC LIMIT 50
  `;
  comments.forEach(c => activities.push({
    type: 'comment', id: c.id, title: c.text, author: c.author_name, createdAt: c.created_at,
  }));

  // Invoices
  const invoices = await sql`
    SELECT id, invoice_number, amount, status, due_date, created_at
    FROM invoices WHERE client_id = ${clientId} ORDER BY created_at DESC LIMIT 50
  `;
  invoices.forEach(i => activities.push({
    type: 'invoice', id: i.id, title: `Invoice ${i.invoice_number}`,
    amount: i.amount, status: i.status, dueDate: i.due_date, createdAt: i.created_at,
  }));

  // Approvals
  const approvals = await sql`
    SELECT id, title, status, requested_by, created_at
    FROM approvals WHERE work_area_id = ANY(${workAreaIds}) ORDER BY created_at DESC LIMIT 50
  `;
  approvals.forEach(a => activities.push({
    type: 'approval', id: a.id, title: a.title, status: a.status,
    requestedBy: a.requested_by, createdAt: a.created_at,
  }));

  // Sort by createdAt descending
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  sendJson(res, 200, { data: activities.slice(0, 100) });
}
