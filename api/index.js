import { sendJson, handleCors } from './lib/utils.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  sendJson(res, 200, {
    name: 'Vereli API',
    version: '0.0.1',
    endpoints: [
      { method: 'GET',  path: '/api/health',    description: 'Health check' },
      { method: 'POST', path: '/api/setup',     description: 'Create schema & seed demo data (run once)' },
      { method: 'GET',  path: '/api/clients',   description: 'List all clients' },
      { method: 'POST', path: '/api/clients',   description: 'Create a client' },
      { method: 'GET',  path: '/api/projects',  description: 'List all projects' },
      { method: 'POST', path: '/api/projects',  description: 'Create a project' },
      { method: 'GET',  path: '/api/invoices',  description: 'List all invoices' },
      { method: 'POST', path: '/api/invoices',  description: 'Create an invoice' },
    ],
  });
}
