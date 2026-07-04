import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { sendEmail } from './lib/email.js';

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
    // Ensure comment columns exist
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS tenant_id INTEGER`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id INTEGER`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id INTEGER`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_initials TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_bg TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_tc TEXT`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS reference TEXT`;

    const { workAreaId, threaded } = req.query || {};
    let rows;
    
    try {
      const tid = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;
      
      if (workAreaId) {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE tenant_id = ${tid} AND work_area_id = ${Number(workAreaId)} ORDER BY created_at DESC`;
        }
      } else {
        if (user.role === 'superadmin' && !req.query.tenantId) {
          rows = await sql`SELECT id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at FROM comments WHERE tenant_id = ${tid} ORDER BY created_at DESC`;
        }
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
      sendJson(res, 500, { error: 'Failed to fetch comments' });
      return;
    }

    let data = rows.map(r => ({
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
    }));

    // If threaded view requested, nest replies under parents
    if (threaded === 'true') {
      const topLevel = data.filter(c => !c.parentId);
      const replies = data.filter(c => c.parentId);
      topLevel.forEach(parent => {
        parent.replies = replies.filter(r => r.parentId === parent.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
      data = topLevel;
    }

    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    const { workAreaId, parentId, authorName, authorInitials, authorBg, authorTc, text, reference } = req.body || {};
    if (!workAreaId || !text) { badRequest(res, 'workAreaId and text are required'); return; }
    
    // Verify work area belongs to tenant
    const [workArea] = await sql`SELECT id, name FROM work_areas WHERE id = ${Number(workAreaId)} AND tenant_id = ${tenantId}`;
    if (!workArea) {
      sendJson(res, 404, { error: 'Work area not found in your workspace' });
      return;
    }

    // If replying to a comment, verify parent exists in same work area
    if (parentId) {
      const [parent] = await sql`SELECT id FROM comments WHERE id = ${Number(parentId)} AND work_area_id = ${Number(workAreaId)}`;
      if (!parent) { badRequest(res, 'Parent comment not found'); return; }
    }
    
    const [row] = await sql`
      INSERT INTO comments (tenant_id, user_id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference)
      VALUES (${tenantId}, ${user.userId}, ${Number(workAreaId)}, ${parentId ? Number(parentId) : null}, ${authorName || 'Anonymous'}, ${authorInitials || null}, ${authorBg || null}, ${authorTc || null}, ${text}, ${reference || null})
      RETURNING id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference, created_at;
    `;

    // Handle @mentions - send email notifications
    const mentionRegex = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
    const mentions = [...text.matchAll(mentionRegex)].map(m => m[1].toLowerCase());
    if (mentions.length > 0) {
      const tenantUsers = await sql`SELECT email, name FROM users WHERE tenant_id = ${tenantId}`;
      const mentionedUsers = tenantUsers.filter(u => mentions.includes(u.email.toLowerCase()));
      const baseUrl = process.env.APP_URL || '';
      for (const mu of mentionedUsers) {
        try {
          await sendEmail({
            to: mu.email,
            subject: `${authorName || 'Someone'} mentioned you in a comment`,
            html: `
              <p>Hi ${mu.name || 'there'},</p>
              <p><strong>${authorName || 'Someone'}</strong> mentioned you in a comment on <strong>${workArea.name || 'a project'}</strong>:</p>
              <blockquote style="border-left:3px solid #17A39B;padding-left:12px;margin:12px 0;color:#4A6E6B">${text}</blockquote>
              <p><a href="${baseUrl}/app/" style="padding:10px 18px;background:#17A39B;color:#fff;text-decoration:none;border-radius:8px;display:inline-block">View comment</a></p>
            `,
          });
        } catch (err) { console.error('Mention email error:', err); }
      }
    }

    sendJson(res, 201, { data: { id: row.id, workAreaId: row.work_area_id, parentId: row.parent_id, authorName: row.author_name, authorInitials: row.author_initials, authorBg: row.author_bg, authorTc: row.author_tc, text: row.text, reference: row.reference, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
