import { describe, it, expect, vi } from 'vitest';
import { sendJson, handleCors, badRequest, notFound } from '../api/lib/utils.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end = () => {};
  return res;
}

describe('sendJson', () => {
  it('sets status and JSON body', () => {
    const res = mockRes();
    sendJson(res, 200, { ok: true });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it('works with error status', () => {
    const res = mockRes();
    sendJson(res, 404, { error: 'Not found' });
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Not found');
  });
});

describe('handleCors', () => {
  it('sets CORS headers on every request', () => {
    const req = { method: 'GET' };
    const res = mockRes();
    handleCors(req, res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('returns true and ends with 204 on OPTIONS preflight', () => {
    const req = { method: 'OPTIONS' };
    const res = mockRes();
    res.status = (s) => { res._status = s; return { end: () => {} }; };
    const result = handleCors(req, res);
    expect(result).toBe(true);
    expect(res._status).toBe(204);
  });

  it('returns false for non-OPTIONS requests', () => {
    const req = { method: 'POST' };
    const res = mockRes();
    const result = handleCors(req, res);
    expect(result).toBe(false);
  });
});

describe('badRequest', () => {
  it('sends 400 with default message', () => {
    const res = mockRes();
    badRequest(res);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('Bad request');
  });

  it('sends 400 with custom message', () => {
    const res = mockRes();
    badRequest(res, 'Email is required');
    expect(res._body.error).toBe('Email is required');
  });
});

describe('notFound', () => {
  it('sends 404 with default message', () => {
    const res = mockRes();
    notFound(res);
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Not found');
  });

  it('sends 404 with custom message', () => {
    const res = mockRes();
    notFound(res, 'Client not found');
    expect(res._body.error).toBe('Client not found');
  });
});
