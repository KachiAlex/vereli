import { sendJson, handleCors } from './lib/utils.js';
import { sql } from './lib/neon.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const [{ now }] = await sql`SELECT NOW() as now`;
    sendJson(res, 200, { status: 'ok', db: 'connected', timestamp: now });
  } catch (err) {
    sendJson(res, 500, { status: 'error', db: 'disconnected', error: err.message });
  }
}
