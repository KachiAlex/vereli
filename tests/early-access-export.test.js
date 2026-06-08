import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/lib/neon.js', () => ({
  sql: vi.fn().mockResolvedValue([
    { id: 1, email: 'alice@example.com', name: 'Alice', company: 'Acme', created_at: '2026-06-01T10:00:00Z' },
    { id: 2, email: 'bob@example.com', name: null, company: null, created_at: '2026-06-02T12:00:00Z' },
    { id: 3, email: 'carl@co.com', name: 'Carl, Jr.', company: 'He said "hello"', created_at: null }
  ])
}));

vi.mock('../api/lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ id: 1, email: 'admin@vereli.app' })
  };
});

import handler from '../api/early-access/export.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end = () => {};
  return res;
}

describe('GET /api/early-access/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-GET methods with 405', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns CSV content-type header', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._headers['Content-Type']).toBe('text/csv');
  });

  it('returns attachment content-disposition header', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._headers['Content-Disposition']).toContain('attachment');
    expect(res._headers['Content-Disposition']).toContain('.csv');
  });

  it('returns 200 with CSV body', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(typeof res._body).toBe('string');
  });

  it('CSV has correct header row', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    const lines = res._body.split('\r\n');
    expect(lines[0]).toBe('id,email,name,company,signed_up_at');
  });

  it('CSV contains all rows from DB', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    const lines = res._body.split('\r\n');
    expect(lines.length).toBe(4); // header + 3 data rows
  });

  it('CSV escapes values with commas', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._body).toContain('"Carl, Jr."');
  });

  it('CSV escapes values with double quotes', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._body).toContain('"He said ""hello"""');
  });

  it('handles null name and company as empty string', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    const lines = res._body.split('\r\n');
    const bobRow = lines[2];
    expect(bobRow).toMatch(/bob@example\.com,,/);
  });

  it('handles null created_at as empty string', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    const lines = res._body.split('\r\n');
    const carlRow = lines[3];
    expect(carlRow.endsWith(',')).toBe(true);
  });
});
