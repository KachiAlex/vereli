import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { db, createRecord } from './lib/db.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const { status, search } = req.query || {};
    let results = db.clients;

    if (status) {
      results = results.filter(c => c.status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.contact.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }

    sendJson(res, 200, { data: results });
    return;
  }

  if (req.method === 'POST') {
    const { name, contact, email, status = 'active' } = req.body || {};
    if (!name || !contact || !email) {
      badRequest(res, 'name, contact, and email are required');
      return;
    }
    const client = createRecord('clients', { name, contact, email, status, portal: { on: false } });
    sendJson(res, 201, { data: client });
    return;
  }

  badRequest(res, 'Method not allowed');
}
