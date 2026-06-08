import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/lib/neon.js', () => ({
  sql: vi.fn().mockResolvedValue([{ id: 1 }])
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({}) }
  }))
}));

import handler from '../api/early-access.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end = () => {};
  return res;
}

describe('POST /api/early-access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-POST methods with 400', async () => {
    const req = { method: 'GET', body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toBeTruthy();
  });

  it('rejects missing email with 400', async () => {
    const req = { method: 'POST', body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/email/i);
  });

  it('rejects invalid email (no @) with 400', async () => {
    const req = { method: 'POST', body: { email: 'notanemail' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('accepts valid email and returns 200', async () => {
    const req = { method: 'POST', body: { email: 'test@example.com', name: 'Alice', company: 'Acme' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
  });

  it('returns success message on valid signup', async () => {
    const req = { method: 'POST', body: { email: 'user@vereli.app' } };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.message).toMatch(/list/i);
  });

  it('handles OPTIONS preflight without processing body', async () => {
    const req = { method: 'OPTIONS', body: {} };
    const res = mockRes();
    res.status = (s) => { res._status = s; return { end: () => {} }; };
    await handler(req, res);
    expect(res._status).toBe(204);
  });
});
