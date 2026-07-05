import { sendJson, handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // Only superadmins can manage plans
  if (user.role !== 'superadmin' && user.email !== 'admin@vereli.com') {
    sendJson(res, 403, { error: 'Forbidden: superadmin only' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const plans = await sql`
        SELECT id, name, slug, description, price_monthly, price_yearly,
               user_limit, client_limit, features, active, sort_order, created_at
        FROM plans
        ORDER BY sort_order ASC, id ASC;
      `;
      sendJson(res, 200, { data: plans });
    } catch (err) {
      console.error('Error fetching plans:', err);
      sendJson(res, 500, { error: 'Failed to fetch plans' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { name, slug, description, priceMonthly, priceYearly, userLimit, clientLimit, features, sortOrder } = req.body || {};
    if (!name || !slug) {
      sendJson(res, 400, { error: 'name and slug are required' });
      return;
    }
    try {
      const [plan] = await sql`
        INSERT INTO plans (name, slug, description, price_monthly, price_yearly, user_limit, client_limit, features, sort_order)
        VALUES (${name}, ${slug}, ${description || ''}, ${priceMonthly || 0}, ${priceYearly || 0}, ${userLimit || null}, ${clientLimit || null}, ${features || []}, ${sortOrder || 0})
        RETURNING id, name, slug, description, price_monthly, price_yearly, user_limit, client_limit, features, active, sort_order, created_at;
      `;
      sendJson(res, 201, {
        message: 'Plan created',
        data: {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          priceMonthly: plan.price_monthly,
          priceYearly: plan.price_yearly,
          userLimit: plan.user_limit,
          clientLimit: plan.client_limit,
          features: plan.features,
          active: plan.active,
          sortOrder: plan.sort_order,
          createdAt: plan.created_at,
        }
      });
    } catch (err) {
      console.error('Error creating plan:', err);
      if (err.message && err.message.includes('unique constraint')) {
        sendJson(res, 409, { error: 'Plan slug already exists' });
        return;
      }
      sendJson(res, 500, { error: 'Failed to create plan' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const planId = req.query && req.query.planId;
    if (!planId) {
      sendJson(res, 400, { error: 'planId query parameter is required' });
      return;
    }

    const { name, slug, description, priceMonthly, priceYearly, userLimit, clientLimit, features, active, sortOrder } = req.body || {};
    if (
      name === undefined && slug === undefined && description === undefined &&
      priceMonthly === undefined && priceYearly === undefined &&
      userLimit === undefined && clientLimit === undefined &&
      features === undefined && active === undefined && sortOrder === undefined
    ) {
      sendJson(res, 400, { error: 'No fields to update' });
      return;
    }

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) { fields.push(`name = $${paramCount++}`); values.push(name); }
      if (slug !== undefined) { fields.push(`slug = $${paramCount++}`); values.push(slug); }
      if (description !== undefined) { fields.push(`description = $${paramCount++}`); values.push(description); }
      if (priceMonthly !== undefined) { fields.push(`price_monthly = $${paramCount++}`); values.push(priceMonthly); }
      if (priceYearly !== undefined) { fields.push(`price_yearly = $${paramCount++}`); values.push(priceYearly); }
      if (userLimit !== undefined) { fields.push(`user_limit = $${paramCount++}`); values.push(userLimit); }
      if (clientLimit !== undefined) { fields.push(`client_limit = $${paramCount++}`); values.push(clientLimit); }
      if (features !== undefined) { fields.push(`features = $${paramCount++}`); values.push(features); }
      if (active !== undefined) { fields.push(`active = $${paramCount++}`); values.push(active); }
      if (sortOrder !== undefined) { fields.push(`sort_order = $${paramCount++}`); values.push(sortOrder); }

      const query = `UPDATE plans SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, name, slug, description, price_monthly, price_yearly, user_limit, client_limit, features, active, sort_order, created_at`;
      values.push(planId);

      const [plan] = await sql(query, values);
      if (!plan) {
        sendJson(res, 404, { error: 'Plan not found' });
        return;
      }
      sendJson(res, 200, {
        data: {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          priceMonthly: plan.price_monthly,
          priceYearly: plan.price_yearly,
          userLimit: plan.user_limit,
          clientLimit: plan.client_limit,
          features: plan.features,
          active: plan.active,
          sortOrder: plan.sort_order,
          createdAt: plan.created_at,
        }
      });
    } catch (err) {
      console.error('Error updating plan:', err);
      if (err.message && err.message.includes('unique constraint')) {
        sendJson(res, 409, { error: 'Plan slug already exists' });
        return;
      }
      sendJson(res, 500, { error: 'Failed to update plan' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const planId = req.query && req.query.planId;
    if (!planId) {
      sendJson(res, 400, { error: 'planId query parameter is required' });
      return;
    }
    try {
      const [plan] = await sql`
        DELETE FROM plans WHERE id = ${planId}
        RETURNING id, name, slug;
      `;
      if (!plan) {
        sendJson(res, 404, { error: 'Plan not found' });
        return;
      }
      sendJson(res, 200, { message: 'Plan deleted', data: { id: plan.id, name: plan.name, slug: plan.slug } });
    } catch (err) {
      console.error('Error deleting plan:', err);
      sendJson(res, 500, { error: 'Failed to delete plan' });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}
