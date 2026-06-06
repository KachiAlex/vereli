import { sendJson, handleCors } from './lib/utils.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  sendJson(res, 200, {
    name: 'Vereli API',
    version: '0.0.1',
    endpoints: [
      { method: 'GET',  path: '/api/health',    description: 'Health check' },
      { method: 'POST', path: '/api/setup',     description: 'Create schema & seed demo data (run once)' },
      { method: 'POST', path: '/api/auth/register', description: 'Register a new user' },
      { method: 'POST', path: '/api/auth/login',    description: 'Login and get tokens' },
      { method: 'POST', path: '/api/auth/refresh',  description: 'Refresh access token' },
      { method: 'GET',  path: '/api/me',        description: 'Current user' },
      { method: 'GET',  path: '/api/clients',   description: 'List all clients' },
      { method: 'POST', path: '/api/clients',   description: 'Create a client' },
      { method: 'GET',  path: '/api/clients/:id', description: 'Get/update/delete a client' },
      { method: 'GET',  path: '/api/projects',  description: 'List all projects' },
      { method: 'POST', path: '/api/projects',  description: 'Create a project' },
      { method: 'GET',  path: '/api/projects/:id', description: 'Get/update/delete a project' },
      { method: 'GET',  path: '/api/invoices',  description: 'List all invoices' },
      { method: 'POST', path: '/api/invoices',  description: 'Create an invoice' },
      { method: 'GET',  path: '/api/invoices/:id', description: 'Get/update/delete an invoice' },
      { method: 'GET',  path: '/api/work-areas', description: 'List work areas' },
      { method: 'POST', path: '/api/work-areas', description: 'Create a work area' },
      { method: 'GET',  path: '/api/work-areas/:id', description: 'Get/update/delete a work area' },
      { method: 'GET',  path: '/api/tasks', description: 'List tasks' },
      { method: 'POST', path: '/api/tasks', description: 'Create a task' },
      { method: 'GET',  path: '/api/tasks/:id', description: 'Get/update/delete a task' },
      { method: 'GET',  path: '/api/files', description: 'List files' },
      { method: 'POST', path: '/api/files', description: 'Create a file record' },
      { method: 'GET',  path: '/api/files/:id', description: 'Get/update/delete a file' },
    ],
  });
}
