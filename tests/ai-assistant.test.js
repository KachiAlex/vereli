import { describe, it, expect, vi } from 'vitest';

vi.mock('../api/lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ userId: 1, tenantId: 1, role: 'admin' })
  };
});

import handler from '../api/ai-assistant.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  return res;
}

describe('AI Assistant API', () => {
  it('summarizes long text', async () => {
    const req = { method: 'POST', body: { action: 'summarize', text: 'First sentence. Second important point. Third detail here.' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.result).toContain('First sentence');
    expect(res._body.data.action).toBe('summarize');
  });

  it('suggests tasks from text', async () => {
    const req = { method: 'POST', body: { action: 'suggest-tasks', text: 'We need to review the design. Must send the invoice. Should prepare the brief.' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    const tasks = JSON.parse(res._body.data.result);
    expect(tasks.length).toBeGreaterThan(0);
    expect(res._body.data.action).toBe('suggest-tasks');
  });

  it('generates follow-up message', async () => {
    const req = { method: 'POST', body: { action: 'overdue-followup', context: { clientName: 'Sarah' } }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.result).toContain('Sarah');
    expect(res._body.data.result).toContain('follow up');
  });

  it('generates task description', async () => {
    const req = { method: 'POST', body: { action: 'generate-description', text: 'Brand logo design' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.result).toContain('Brand logo design');
    expect(res._body.data.result).toContain('Objective');
  });

  it('rejects missing action', async () => {
    const req = { method: 'POST', body: {}, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});
