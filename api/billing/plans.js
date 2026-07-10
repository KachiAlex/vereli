import { sendJson, handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const plans = await sql`
      SELECT id, name, slug, description, price_monthly, price_yearly, currency,
             user_limit, client_limit, features, active, sort_order
      FROM plans WHERE active = true ORDER BY sort_order ASC, id ASC;
    `;
    sendJson(res, 200, { data: plans });
  } catch (err) {
    console.error('[billing/plans] error:', err);
    sendJson(res, 500, { error: 'Failed to fetch plans' });
  }
}
