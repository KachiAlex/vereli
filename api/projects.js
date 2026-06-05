import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { db, createRecord } from './lib/db.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    let results = db.projects;

    if (clientId) {
      results = results.filter(p => p.clientId === Number(clientId));
    }
    if (status) {
      results = results.filter(p => p.status === status);
    }

    sendJson(res, 200, { data: results });
    return;
  }

  if (req.method === 'POST') {
    const { clientId, name, budget, status = 'pending' } = req.body || {};
    if (!clientId || !name) {
      badRequest(res, 'clientId and name are required');
      return;
    }
    const project = createRecord('projects', { clientId: Number(clientId), name, budget: Number(budget) || 0, status, tasksTotal: 0, tasksPending: 0 });
    sendJson(res, 201, { data: project });
    return;
  }

  badRequest(res, 'Method not allowed');
}
