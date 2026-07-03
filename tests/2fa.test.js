import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUsers = [{ id: 1, totp_secret: 'abc123def456', totp_enabled: false }];

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
    const allValues = Array.isArray(values[0]) ? values[0] : values;
    if (query.includes('UPDATE users SET totp_secret')) {
      mockUsers[0].totp_secret = allValues[0];
      return Promise.resolve([]);
    }
    if (query.includes('UPDATE users SET totp_enabled')) {
      mockUsers[0].totp_enabled = true;
      return Promise.resolve([]);
    }
    if (query.includes('SELECT totp_secret, totp_enabled')) {
      return Promise.resolve([mockUsers[0]]);
    }
    return Promise.resolve([]);
  })
}));

vi.mock('../api/lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ userId: 1, tenantId: 1, email: 'alice@example.com', role: 'admin' })
  };
});

import setupHandler from '../api/auth/2fa-setup.js';
import verifyHandler, { generateTOTP } from '../api/auth/2fa-verify.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  return res;
}

describe('2FA API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers[0] = { id: 1, totp_secret: 'abc123def456', totp_enabled: false };
  });

  it('POST /2fa-setup returns secret and QR URL', async () => {
    const req = { method: 'POST', headers: {} };
    const res = mockRes();
    await setupHandler(req, res);
    expect(res._body.secret).toBeDefined();
    expect(res._body.qrUrl).toContain('qrserver.com');
    expect(res._body.manualEntry).toBeDefined();
  });

  it('generateTOTP produces 6-digit code', async () => {
    const code = generateTOTP('deadbeef');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('POST /2fa-verify accepts valid code', async () => {
    const code = generateTOTP(mockUsers[0].totp_secret);
    const req = { method: 'POST', body: { code, action: 'setup' }, headers: {} };
    const res = mockRes();
    await verifyHandler(req, res);
    expect(res._body.message).toBe('2FA enabled');
    expect(mockUsers[0].totp_enabled).toBe(true);
  });

  it('POST /2fa-verify rejects invalid code', async () => {
    const req = { method: 'POST', body: { code: '000000', action: 'setup' }, headers: {} };
    const res = mockRes();
    await verifyHandler(req, res);
    expect(res._status).toBe(401);
  });

  it('POST /2fa-verify rejects short code', async () => {
    const req = { method: 'POST', body: { code: '123', action: 'setup' }, headers: {} };
    const res = mockRes();
    await verifyHandler(req, res);
    expect(res._status).toBe(400);
  });
});
