import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { db, createRecord } from './lib/db.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const { clientId, status } = req.query || {};
    let results = db.invoices;

    if (clientId) {
      results = results.filter(i => i.clientId === Number(clientId));
    }
    if (status) {
      results = results.filter(i => i.status === status);
    }

    sendJson(res, 200, { data: results });
    return;
  }

  if (req.method === 'POST') {
    const { clientId, projectId, amount, currency = 'NGN', dueDate, status = 'pending' } = req.body || {};
    if (!clientId || !projectId || !amount || !dueDate) {
      badRequest(res, 'clientId, projectId, amount, and dueDate are required');
      return;
    }
    const invoice = createRecord('invoices', {
      clientId: Number(clientId),
      projectId: Number(projectId),
      amount: Number(amount),
      currency,
      status,
      dueDate,
    });
    sendJson(res, 201, { data: invoice });
    return;
  }

  badRequest(res, 'Method not allowed');
}
