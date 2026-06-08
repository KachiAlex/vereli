import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { token } = req.query || {};
  if (!token) {
    badRequest(res, 'token is required');
    return;
  }

  try {
    // Look up the invitation
    const [invitation] = await sql`
      SELECT i.*, t.name as tenant_name, t.slug as tenant_slug, inv.name as inviter_name
      FROM invitations i
      JOIN tenants t ON i.tenant_id = t.id
      LEFT JOIN users inv ON i.invited_by = inv.id
      WHERE i.token = ${token}
      AND i.status = 'pending'
      AND i.expires_at > NOW()
    `;

    if (!invitation) {
      sendJson(res, 404, { error: 'Invalid or expired invitation token' });
      return;
    }

    // Check if email is already registered
    const [existingUser] = await sql`SELECT id FROM users WHERE email = ${invitation.email.toLowerCase()}`;

    sendJson(res, 200, {
      data: {
        email: invitation.email,
        role: invitation.role,
        tenantName: invitation.tenant_name,
        tenantSlug: invitation.tenant_slug,
        invitedBy: invitation.inviter_name,
        expiresAt: invitation.expires_at,
        isNewUser: !existingUser,
      }
    });
  } catch (err) {
    console.error('Error verifying invitation:', err);
    sendJson(res, 500, { error: 'Failed to verify invitation' });
  }
}
