import { sendJson, handleCors, badRequest } from '../lib/utils.js';
import { createTokens, verifyRefreshToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    badRequest(res, 'refreshToken is required');
    return;
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    const { userId, email, name, role } = payload;
    const tokens = await createTokens({ userId, email, name, role });

    sendJson(res, 200, {
      data: { user: { id: userId, email, name, role } },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch {
    sendJson(res, 401, { error: 'Invalid or expired refresh token' });
  }
}
