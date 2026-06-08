import { handleCors, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const rows = await sql`
      SELECT id, email, name, company, created_at
      FROM early_access
      ORDER BY created_at DESC;
    `;

    const header = 'id,email,name,company,signed_up_at';
    const lines = rows.map(r => [
      r.id,
      csvEscape(r.email),
      csvEscape(r.name || ''),
      csvEscape(r.company || ''),
      r.created_at ? new Date(r.created_at).toISOString() : ''
    ].join(','));

    const csv = [header, ...lines].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="early-access-signups.csv"');
    res.status(200).send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export signups' });
  }
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
