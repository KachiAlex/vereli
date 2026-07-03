import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRows = [];
let lastInsert = null;

vi.mock('../api/lib/neon.js', () => ({
  sql: vi.fn((strings, ...args) => {
    let query = '';
    let values = [];
    if (Array.isArray(strings)) {
      query = strings.reduce((acc, str, i) => acc + str + (args[i] !== undefined ? '?' : ''), '');
      values = args;
    } else {
      query = strings;
      values = args[0] || [];
    }
    // Work area verification
    if (query.includes('FROM work_areas') && query.includes('SELECT')) {
      return Promise.resolve([{ id: values[0] || 1, name: 'Test Area' }]);
    }
    // Parent comment verification
    if (query.includes('FROM comments') && query.includes('SELECT id') && !query.includes('parent_id')) {
      return Promise.resolve([{ id: values[0] || 1 }]);
    }
    // INSERT comment
    if (query.includes('INSERT INTO comments')) {
      // VALUES (tenant_id, user_id, work_area_id, parent_id, author_name, author_initials, author_bg, author_tc, text, reference)
      lastInsert = {
        id: 42,
        work_area_id: values[2] || 1,
        parent_id: values[3] ?? null,
        author_name: values[4] || 'Test',
        author_initials: values[5] || 'T',
        author_bg: values[6] || '#eee',
        author_tc: values[7] || '#000',
        text: values[8] || 'Hello',
        reference: values[9] ?? null,
        created_at: new Date().toISOString()
      };
      return Promise.resolve([lastInsert]);
    }
    // Users for @mentions
    if (query.includes('FROM users') && query.includes('SELECT email')) {
      return Promise.resolve([{ email: 'alice@example.com', name: 'Alice' }]);
    }
    // GET comments
    if (query.includes('SELECT id, work_area_id, parent_id')) {
      return Promise.resolve(mockRows);
    }
    return Promise.resolve([]);
  })
}));

vi.mock('../api/lib/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({})
}));

vi.mock('../api/lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ userId: 1, tenantId: 1, role: 'admin' })
  };
});

import handler from '../api/comments.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end = () => {};
  return res;
}

describe('Comments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.length = 0;
    lastInsert = null;
  });

  it('GET returns threaded comments', async () => {
    mockRows.push({ id: 1, work_area_id: 1, parent_id: null, author_name: 'Alice', author_initials: 'A', author_bg: '#eee', author_tc: '#000', text: 'Parent', reference: null, created_at: '2026-01-01' });
    mockRows.push({ id: 2, work_area_id: 1, parent_id: 1, author_name: 'Bob', author_initials: 'B', author_bg: '#eee', author_tc: '#000', text: 'Reply', reference: null, created_at: '2026-01-02' });
    const req = { method: 'GET', query: { workAreaId: '1', threaded: 'true' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data).toBeDefined();
    expect(res._body.data.length).toBe(1);
    expect(res._body.data[0].replies.length).toBe(1);
    expect(res._body.data[0].replies[0].text).toBe('Reply');
  });

  it('POST creates a top-level comment', async () => {
    const req = { method: 'POST', body: { workAreaId: 1, authorName: 'Alice', text: 'Hello world' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data).toBeDefined();
    expect(res._body.data.text).toBe('Hello world');
  });

  it('POST creates a reply comment with parentId', async () => {
    const req = { method: 'POST', body: { workAreaId: 1, parentId: 1, authorName: 'Bob', text: 'Reply here' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data).toBeDefined();
    expect(lastInsert.parent_id).toBe(1);
  });

  it('POST sends email on @mention', async () => {
    const { sendEmail } = await import('../api/lib/email.js');
    const req = { method: 'POST', body: { workAreaId: 1, authorName: 'Alice', text: 'Hey @alice@example.com check this' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(sendEmail).toHaveBeenCalled();
  });

  it('rejects POST without workAreaId', async () => {
    const req = { method: 'POST', body: { text: 'No work area' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});
