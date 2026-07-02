import { sendJson, handleCors } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function computeNextRun(date, frequency) {
  switch (frequency) {
    case 'weekly': return addDays(date, 7);
    case 'biweekly': return addDays(date, 14);
    case 'monthly': return addMonths(date, 1);
    case 'quarterly': return addMonths(date, 3);
    case 'yearly': return addYears(date, 1);
    default: return addMonths(date, 1);
  }
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // Optional cron secret to prevent unauthorized calls
  const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS recurring_invoices (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        frequency TEXT NOT NULL DEFAULT 'monthly',
        line_items JSONB DEFAULT '[]',
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE,
        next_run_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const today = new Date().toISOString().split('T')[0];
    const recurring = await sql`
      SELECT id, tenant_id, client_id, name, amount, currency, frequency, line_items, next_run_date, end_date
      FROM recurring_invoices
      WHERE status = 'active' AND next_run_date <= ${today}
    `;

    const generated = [];

    for (const r of recurring) {
      // Don't generate if past end_date
      if (r.end_date && r.end_date < r.next_run_date) {
        await sql`UPDATE recurring_invoices SET status = 'completed' WHERE id = ${r.id}`;
        continue;
      }

      const [invoice] = await sql`
        INSERT INTO invoices (tenant_id, user_id, client_id, amount, currency, status, due_date, line_items, created_at)
        VALUES (${r.tenant_id}, null, ${r.client_id}, ${r.amount}, ${r.currency}, 'draft', ${addDays(r.next_run_date, 14).toISOString().split('T')[0]}, ${JSON.stringify(r.line_items || [])}, NOW())
        RETURNING id;
      `;

      const nextRun = computeNextRun(r.next_run_date, r.frequency);
      const nextRunStr = nextRun.toISOString().split('T')[0];
      await sql`UPDATE recurring_invoices SET next_run_date = ${nextRunStr} WHERE id = ${r.id}`;

      generated.push({ recurringId: r.id, invoiceId: invoice.id, tenantId: r.tenant_id });
    }

    sendJson(res, 200, { message: `Generated ${generated.length} invoices`, data: generated });
  } catch (err) {
    console.error('Invoice generation error:', err);
    sendJson(res, 500, { error: 'Failed to generate invoices' });
  }
}
