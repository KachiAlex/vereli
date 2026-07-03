import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProposals = [];
let nextId = 1;

vi.mock('../api/lib/neon.js', () => ({
  sql: vi.fn((strings, ...values) => {
    let query = '';
    if (Array.isArray(strings)) {
      // Template literal call
      query = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? '?' : ''), '');
    } else {
      // Parameterized call: sql(queryString, valuesArray)
      query = strings;
      values = values[0] || [];
    }

    if (query.includes('SELECT id FROM clients')) {
      return Promise.resolve([{ id: 1 }]);
    }
    if (query.includes('INSERT INTO proposals')) {
      const row = {
        id: nextId++,
        client_id: Array.isArray(values) ? (values[1] || 1) : 1,
        title: Array.isArray(values) ? (values[2] || 'Test') : 'Test',
        description: Array.isArray(values) ? values[3] : null,
        amount: Array.isArray(values) ? (values[4] || 100) : 100,
        currency: Array.isArray(values) ? (values[5] || 'USD') : 'USD',
        status: 'draft',
        line_items: Array.isArray(values) ? (values[7] || '[]') : '[]',
        valid_until: Array.isArray(values) ? values[8] : null,
        accepted_at: null,
        created_at: new Date().toISOString()
      };
      mockProposals.push(row);
      return Promise.resolve([row]);
    }
    if (query.includes('SELECT id, client_id, title') && !query.includes('WHERE id =')) {
      return Promise.resolve(mockProposals);
    }
    if (query.includes('SELECT id, client_id, title') && query.includes('WHERE id =')) {
      const id = values[0];
      return Promise.resolve(mockProposals.filter(p => p.id === id));
    }
    if (query.includes('UPDATE proposals SET')) {
      // Find proposal by last value (id)
      const targetId = Array.isArray(values) ? values[values.length - 1] || values[values.length - 2] : values;
      const prop = mockProposals.find(p => p.id === targetId);
      if (prop) {
        const statusVal = values.find(v => v === 'accepted');
        if (statusVal) {
          prop.status = 'accepted';
          prop.accepted_at = new Date().toISOString();
        }
      }
      return Promise.resolve(prop ? [prop] : []);
    }
    if (query.includes('DELETE FROM proposals')) {
      const targetId = Array.isArray(values) ? values[0] : values;
      const idx = mockProposals.findIndex(p => p.id === targetId);
      if (idx >= 0) {
        const removed = mockProposals.splice(idx, 1)[0];
        return Promise.resolve([removed]);
      }
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  })
}));

vi.mock('../api/lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ userId: 1, tenantId: 1, role: 'admin' })
  };
});

vi.mock('../api/lib/auth.js', () => ({
  canManageData: vi.fn().mockReturnValue(true)
}));

import handler from '../api/proposals.js';
import idHandler from '../api/proposals/[id].js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  return res;
}

describe('Proposals API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProposals.length = 0;
    nextId = 1;
  });

  it('GET lists proposals', async () => {
    mockProposals.push({ id: 1, client_id: 1, title: 'Web Design', amount: 5000, currency: 'USD', status: 'draft', line_items: '[]', valid_until: null, accepted_at: null, created_at: '2026-01-01' });
    const req = { method: 'GET', query: {}, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.length).toBe(1);
    expect(res._body.data[0].title).toBe('Web Design');
  });

  it('POST creates a proposal', async () => {
    const req = { method: 'POST', body: { clientId: 1, title: 'Logo Design', amount: 1000, currency: 'USD', lineItems: [{ desc: 'Logo', qty: 1, rate: 1000 }] }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.title).toBe('Logo Design');
    expect(res._body.data.status).toBe('draft');
  });

  it('PATCH marks proposal accepted', async () => {
    mockProposals.push({ id: 1, client_id: 1, title: 'Web', amount: 100, currency: 'USD', status: 'draft', line_items: '[]', valid_until: null, accepted_at: null, created_at: '2026-01-01' });
    const req = { method: 'PATCH', query: { id: '1' }, body: { status: 'accepted' }, headers: {} };
    const res = mockRes();
    await idHandler(req, res);
    expect(res._body.data.status).toBe('accepted');
    expect(res._body.data.acceptedAt).toBeDefined();
  });

  it('DELETE removes a proposal', async () => {
    mockProposals.push({ id: 1, client_id: 1, title: 'Web', amount: 100, currency: 'USD', status: 'draft', line_items: '[]', valid_until: null, accepted_at: null, created_at: '2026-01-01' });
    const req = { method: 'DELETE', query: { id: '1' }, headers: {} };
    const res = mockRes();
    await idHandler(req, res);
    expect(res._body.message).toBe('Proposal deleted');
  });
});
