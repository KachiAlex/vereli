import { sendJson, handleCors, badRequest, setCookie } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import { createTokens, checkTenantLimit } from '../lib/auth.js';
import bcryptjs from 'bcryptjs';
import { checkRateLimit } from '../lib/rate-limit.js';

function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Date.now().toString(36);
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  if (checkRateLimit(req, { windowMs: 15 * 60 * 1000, maxRequests: 3 })) {
    sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
    return;
  }

  const { email, password, name, company, invitationToken } = req.body || {};
  if (!email || !password || !name) {
    badRequest(res, 'email, password, and name are required');
    return;
  }

  try {
    // Check if email already exists
    const [existing] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing) {
      sendJson(res, 409, { error: 'Email already registered' });
      return;
    }

    let tenantId = null;
    let userRole = 'admin'; // Default for new tenant creators
    let tenantName = company || name + ' Workspace';
    let tenantSlug = generateSlug(tenantName);

    // Check if this is an invitation acceptance
    if (invitationToken) {
      const [invitation] = await sql`
        SELECT * FROM invitations 
        WHERE token = ${invitationToken} 
        AND email = ${email.toLowerCase()}
        AND status = 'pending'
        AND expires_at > NOW()
      `;
      
      if (!invitation) {
        sendJson(res, 400, { error: 'Invalid or expired invitation' });
        return;
      }

      // Use the invitation's tenant and role
      tenantId = invitation.tenant_id;
      userRole = invitation.role;
      
      // Check plan user limit
      const limitCheck = await checkTenantLimit(sql, tenantId, 'users');
      if (!limitCheck.allowed) {
        sendJson(res, 403, { error: limitCheck.reason, limit: limitCheck.limit, current: limitCheck.current });
        return;
      }

      // Get tenant info
      const [tenant] = await sql`SELECT name, slug FROM tenants WHERE id = ${tenantId}`;
      if (tenant) {
        tenantName = tenant.name;
        tenantSlug = tenant.slug;
      }
    } else {
      // New tenant registration - check if company name provided
      if (!company) {
        badRequest(res, 'company name is required to create a new workspace');
        return;
      }

      // Ensure trial_ends_at column exists
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`;

      // Create new tenant for this user with 14-day free trial
      const [tenant] = await sql`
        INSERT INTO tenants (name, slug, status, plan, trial_ends_at)
        VALUES (${tenantName}, ${tenantSlug}, 'active', 'starter', NOW() + INTERVAL '14 days')
        RETURNING id, name, slug;
      `;
      
      tenantId = tenant.id;
      tenantName = tenant.name;
      tenantSlug = tenant.slug;
      userRole = 'admin'; // First user is always admin
    }

    // Hash password before storing
    const passwordHash = await bcryptjs.hash(password, 12);

    // Create the user
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, tenant_id, role)
      VALUES (${email.toLowerCase()}, ${passwordHash}, ${name}, ${tenantId}, ${userRole})
      RETURNING id, email, name, tenant_id, role;
    `;

    // If this was an invitation, mark it as accepted
    if (invitationToken) {
      await sql`
        UPDATE invitations 
        SET status = 'accepted' 
        WHERE token = ${invitationToken}
      `;
      
      // Add user to team_members table
      await sql`
        INSERT INTO team_members (tenant_id, user_id, email, name, role, status)
        VALUES (${tenantId}, ${user.id}, ${email.toLowerCase()}, ${name}, ${userRole}, 'active')
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active', role = ${userRole}
      `;
    } else {
      // First user of new tenant - add to team_members as admin
      await sql`
        INSERT INTO team_members (tenant_id, user_id, email, name, role, status)
        VALUES (${tenantId}, ${user.id}, ${email.toLowerCase()}, ${name}, 'admin', 'active')
      `;
    }

    const { accessToken, refreshToken } = await createTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: tenantName,
      tenantSlug: tenantSlug,
    });

    setCookie(res, 'access_token', accessToken, 900);   // 15 min
    setCookie(res, 'refresh_token', refreshToken, 604800); // 7 days

    sendJson(res, 201, {
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: tenantName,
          tenantSlug: tenantSlug,
        }
      }
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}
