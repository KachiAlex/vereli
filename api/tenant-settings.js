import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const tenantId = user.tenantId;
  if (!tenantId) {
    sendJson(res, 403, { error: 'No tenant assigned' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const [tenant] = await sql`SELECT settings FROM tenants WHERE id = ${tenantId}`;
      const settings = tenant?.settings || {};
      sendJson(res, 200, {
        data: {
          categories: settings.categories || ['Strategy','Communications','Media','Editorial','Advisory','Design','Production','Marketing'],
          stages: settings.stages || ['Todo','In progress','Review','Approved','Completed'],
          labels: settings.labels || ['Project','Campaign','Retainer','Advisory','Engagement'],
        }
      });
    } catch (err) {
      console.error('Error fetching tenant settings:', err);
      sendJson(res, 500, { error: 'Failed to fetch settings' });
    }
    return;
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const { categories, stages, labels } = req.body || {};
    if (categories === undefined && stages === undefined && labels === undefined) {
      badRequest(res, 'No fields to update');
      return;
    }

    try {
      const [tenant] = await sql`SELECT settings FROM tenants WHERE id = ${tenantId}`;
      const current = tenant?.settings || {};
      const next = { ...current };
      if (categories !== undefined) next.categories = categories;
      if (stages !== undefined) next.stages = stages;
      if (labels !== undefined) next.labels = labels;

      await sql`UPDATE tenants SET settings = ${JSON.stringify(next)} WHERE id = ${tenantId}`;

      sendJson(res, 200, {
        data: {
          categories: next.categories || [],
          stages: next.stages || [],
          labels: next.labels || [],
        }
      });
    } catch (err) {
      console.error('Error updating tenant settings:', err);
      sendJson(res, 500, { error: 'Failed to update settings' });
    }
    return;
  }

  badRequest(res, 'Method not allowed');
}
