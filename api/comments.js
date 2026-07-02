import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

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
    const { workAreaId } = req.query || {};
    let rows;
    
    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (workAreaId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE tenant_id = ${tid} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
        }
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
      sendJson(res, 500, { error: 'Failed to fetch comments' });
      return;
    }
    const data = rows.map(r => ({
      id: r.id,
      workAreaId: r.work_area_id,
      authorName: r.author_name,
      authorInitials: r.author_initials,
      authorBg: r.author_bg,
      authorTc: r.author_tc,
      text: r.text,
      reference: r.reference,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { workAreaId, authorName, authorInitials, authorBg, authorTc, text, reference } = req.body || {};
    if (!workAreaId || !text) { badRequest(res, 'workAreaId and text are required'); return; }
    
    // Verify work area belongs to tenant
    const [workArea] = await sql`SELECT id FROM work_areas WHERE id = ${Number(workAreaId)} AND tenant_id = ${tenantId}`;
    if (!workArea) {
      sendJson(res, 404, { error: 'Work area not found in your workspace' });
      return;
    }
    
    const [row] = await sql`
      INSERT INTO comments (tenant_id, user_id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference)
      VALUES (${tenantId}, ${user.userId}, ${Number(workAreaId)}, ${authorName || 'Anonymous'}, ${authorInitials || null}, ${authorBg || null}, ${authorTc || null}, ${text}, ${reference || null})
      RETURNING id, work_area_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, authorName: row.author_name, authorInitials: row.author_initials, authorBg: row.author_bg, authorTc: row.author_tc, text: row.text, reference: row.reference, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
