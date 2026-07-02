import { handleCors, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Simple polling endpoint for recent activity/notifications
  const tenantId = user.tenantId;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  try {
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch recent items across entities as "activity"
    const [clients, invoices, tasks, approvals, comments] = await Promise.all([
      sql`SELECT id, name, status, created_at, 'client' as type FROM clients WHERE tenant_id = ${tenantId} AND created_at >= ${since} ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT id, client_id, amount, status, created_at, 'invoice' as type FROM invoices WHERE tenant_id = ${tenantId} AND created_at >= ${since} ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT id, work_area_id, text, status, created_at, 'task' as type FROM tasks WHERE tenant_id = ${tenantId} AND created_at >= ${since} ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT id, work_area_id, item, status, created_at, 'approval' as type FROM approvals WHERE tenant_id = ${tenantId} AND created_at >= ${since} ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT id, work_area_id, author_name, text, created_at, 'comment' as type FROM comments WHERE tenant_id = ${tenantId} AND created_at >= ${since} ORDER BY created_at DESC LIMIT ${limit}`,
    ]);

    const all = [
      ...clients.map(r => ({ id: r.id, entity: 'client', title: r.name, status: r.status, createdAt: r.created_at })),
      ...invoices.map(r => ({ id: r.id, entity: 'invoice', title: `Invoice #${r.id}`, status: r.status, amount: r.amount, createdAt: r.created_at })),
      ...tasks.map(r => ({ id: r.id, entity: 'task', title: r.text, status: r.status, createdAt: r.created_at })),
      ...approvals.map(r => ({ id: r.id, entity: 'approval', title: r.item, status: r.status, createdAt: r.created_at })),
      ...comments.map(r => ({ id: r.id, entity: 'comment', title: r.text, author: r.author_name, createdAt: r.created_at })),
    ];

    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({ data: all.slice(0, limit) });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}
