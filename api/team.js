import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageTenant } from './lib/auth.js';
import { randomBytes } from 'crypto';

function generateToken() {
  return randomBytes(32).toString('hex');
}

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

  // Superadmin viewing specific tenant
  const targetTenantId = user.role === 'superadmin' && req.query.tenantId ? req.query.tenantId : tenantId;

  if (req.method === 'GET') {
    let rows;
    try {
      rows = await sql`SELECT tm.id, tm.email, tm.name, tm.role, tm.status, tm.created_at, u.id as user_id 
        FROM team_members tm 
        LEFT JOIN users u ON u.email = tm.email AND u.tenant_id = tm.tenant_id
        WHERE tm.tenant_id = ${targetTenantId} 
        ORDER BY tm.created_at DESC`;
    } catch (err) {
      console.error('Error fetching team members:', err);
      sendJson(res, 500, { error: 'Failed to fetch team members' });
      return;
    }
    const data = rows.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
    }));
    sendJson(res, 200, { data });
    return;
  }

  if (req.method === 'POST') {
    // Only admins can invite team members
    if (!canManageTenant(user)) {
      sendJson(res, 403, { error: 'Only workspace admins can invite team members' });
      return;
    }

    const { email, name, role = 'member' } = req.body || {};
    if (!email) { badRequest(res, 'email is required'); return; }
    
    // Check if already invited in this tenant
    const [existing] = await sql`SELECT id FROM team_members WHERE tenant_id = ${targetTenantId} AND email = ${email.toLowerCase()}`;
    if (existing) { badRequest(res, 'Team member already invited to this workspace'); return; }
    
    // Check if user already exists in this tenant
    const [existingUser] = await sql`SELECT id FROM users WHERE tenant_id = ${targetTenantId} AND email = ${email.toLowerCase()}`;
    if (existingUser) { badRequest(res, 'User already exists in this workspace'); return; }
    
    // Create invitation token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration
    
    // Create invitation record
    await sql`
      INSERT INTO invitations (tenant_id, email, role, token, invited_by, expires_at)
      VALUES (${targetTenantId}, ${email.toLowerCase()}, ${role}, ${token}, ${user.userId}, ${expiresAt.toISOString()})
    `;
    
    // Add to team_members
    const [row] = await sql`
      INSERT INTO team_members (tenant_id, user_id, email, name, role, status)
      VALUES (${targetTenantId}, ${existingUser ? existingUser.id : null}, ${email.toLowerCase()}, ${name || null}, ${role}, 'invited')
      RETURNING id, email, name, role, status, created_at;
    `;
    
    // TODO: Send invitation email with token
    // sendInvitationEmail(email, token, user.name, tenantName);
    sendJson(res, 201, { data: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, createdAt: row.created_at } });
    return;
  }

  badRequest(res, 'Method not allowed');
}
