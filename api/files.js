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
    const { workAreaId } = req.query || {};
    let rows;
    
    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (workAreaId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, name, type, size, visibility, uploader_name, created_at FROM files WHERE work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, work_area_id, name, type, size, visibility, uploader_name, created_at FROM files WHERE tenant_id = ${tid} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, name, type, size, visibility, uploader_name, created_at FROM files ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, work_area_id, name, type, size, visibility, uploader_name, created_at FROM files WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
        }
      }
    } catch (err) {
      console.error('Error fetching files:', err);
      sendJson(res, 500, { error: 'Failed to fetch files' });
      return;
    }
    const data = rows.map(r => ({
      id: r.id,
      workAreaId: r.work_area_id,
      name: r.name,
      type: r.type,
      size: r.size,
      visibility: r.visibility,
      uploaderName: r.uploader_name,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    if (!canManageData(user)) {
      sendJson(res, 403, { error: 'Insufficient permissions to upload files' });
      return;
    }

    const { workAreaId, name, type = 'document', size, visibility = 'internal', uploaderName } = req.body || {};
    if (!workAreaId || !name) { badRequest(res, 'workAreaId and name are required'); return; }
    
    // Verify work area belongs to tenant
    const [workArea] = await sql`SELECT id FROM work_areas WHERE id = ${Number(workAreaId)} AND tenant_id = ${tenantId}`;
    if (!workArea) {
      sendJson(res, 404, { error: 'Work area not found in your workspace' });
      return;
    }
    
    const [row] = await sql`
      INSERT INTO files (tenant_id, user_id, work_area_id, name, type, size, visibility, uploader_name)
      VALUES (${tenantId}, ${user.userId}, ${Number(workAreaId)}, ${name}, ${type}, ${size || null}, ${visibility}, ${uploaderName || null})
      RETURNING id, work_area_id, name, type, size, visibility, uploader_name, created_at;
    `;
    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, name: row.name, type: row.type, size: row.size, visibility: row.visibility, uploaderName: row.uploader_name, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
