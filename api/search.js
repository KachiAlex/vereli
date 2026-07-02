import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { q } = req.query || {};
  if (!q || q.length < 2) {
    badRequest(res, 'Query must be at least 2 characters');
    return;
  }

  const tenantId = user.tenantId;
  const searchTerm = `%${q}%`;
  const limit = 10;

  try {
    const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

    const [clients, projects, invoices, tasks, files] = await Promise.all([
      sql`SELECT id, name, status, 'client' as entity FROM clients WHERE tenant_id = ${tid} AND (name ILIKE ${searchTerm} OR email ILIKE ${searchTerm}) ORDER BY name LIMIT ${limit}`,
      sql`SELECT id, name, status, 'project' as entity FROM projects WHERE tenant_id = ${tid} AND name ILIKE ${searchTerm} ORDER BY name LIMIT ${limit}`,
      sql`SELECT id, client_id, amount::text as title, status, 'invoice' as entity FROM invoices WHERE tenant_id = ${tid} AND (status ILIKE ${searchTerm} OR amount::text ILIKE ${searchTerm}) ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT id, work_area_id, text as title, status, 'task' as entity FROM tasks WHERE tenant_id = ${tid} AND text ILIKE ${searchTerm} ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT id, work_area_id, name as title, type, 'file' as entity FROM files WHERE tenant_id = ${tid} AND name ILIKE ${searchTerm} ORDER BY created_at DESC LIMIT ${limit}`,
    ]);

    const results = [
      ...clients.map(r => ({ id: r.id, entity: r.entity, title: r.name, status: r.status })),
      ...projects.map(r => ({ id: r.id, entity: r.entity, title: r.name, status: r.status })),
      ...invoices.map(r => ({ id: r.id, entity: r.entity, title: `Invoice: ${r.title}`, status: r.status })),
      ...tasks.map(r => ({ id: r.id, entity: r.entity, title: r.title, status: r.status })),
      ...files.map(r => ({ id: r.id, entity: r.entity, title: r.title, type: r.type })),
    ];

    sendJson(res, 200, { data: results });
  } catch (err) {
    console.error('Search error:', err);
    sendJson(res, 500, { error: 'Search failed' });
  }
}
