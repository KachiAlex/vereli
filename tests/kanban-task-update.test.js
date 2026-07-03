import { describe, it, expect, vi } from 'vitest';

const mockTasks = [{ id: 1, work_area_id: 1, text: 'Test task', done: false, assignee: 'Alice', status: 'todo', priority: 'high', tenant_id: 1, created_at: '2026-01-01' }];

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
    if (query.includes('UPDATE tasks SET') && query.includes('status')) {
      const allValues = Array.isArray(values[0]) ? values[0] : values;
      const targetId = allValues[allValues.length - 2]; // id before tenant_id
      const task = mockTasks.find(t => t.id === targetId);
      if (task) {
        task.status = allValues[0];
        if (allValues[1] && query.includes('priority')) task.priority = allValues[1];
        if (allValues[2] && query.includes('assignee')) task.assignee = allValues[2];
        return Promise.resolve([{ ...task }]);
      }
    }
    if (query.includes('SELECT id, work_area_id, text')) {
      const allValues = Array.isArray(values[0]) ? values[0] : values;
      const id = allValues[0];
      return Promise.resolve(mockTasks.filter(t => t.id === id));
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

import handler from '../api/tasks/[id].js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  return res;
}

describe('Task Status Update (Kanban)', () => {
  it('PATCH updates task status to in-progress', async () => {
    const req = { method: 'PATCH', query: { id: '1' }, body: { status: 'in-progress' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.status).toBe('in-progress');
  });

  it('PATCH updates task status to completed', async () => {
    const req = { method: 'PATCH', query: { id: '1' }, body: { status: 'completed' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._body.data.status).toBe('completed');
  });

});
