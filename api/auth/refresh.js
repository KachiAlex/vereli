import { sendJson, handleCors, badRequest, parseCookie, setCookie } from '../lib/utils.js';
import { createTokens, verifyRefreshToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const cookies = parseCookie(req);
  const refreshToken = cookies.refresh_token;
  if (!refreshToken) {
    badRequest(res, 'refreshToken is required');
    return;
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    const { userId, email, name, role, tenantId, tenantName, tenantSlug } = payload;

    // Create new tokens with full tenant context
    const tokens = await createTokens({
      userId,
      email,
      name,
      role,
      tenantId,
      tenantName,
      tenantSlug
    });

    setCookie(res, 'access_token', tokens.accessToken, 900);   // 15 min
    setCookie(res, 'refresh_token', tokens.refreshToken, 604800); // 7 days

    sendJson(res, 200, {
      data: {
        user: {
          id: userId,
          email,
          name,
          role,
          tenantId,
          tenantName,
          tenantSlug,
        }
      }
    });
  } catch {
    sendJson(res, 401, { error: 'Invalid or expired refresh token' });
  }
}
