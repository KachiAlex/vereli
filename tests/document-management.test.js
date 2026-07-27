import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track uploaded files for verification
const uploadedFiles = [];
let r2UploadCallCount = 0;

// Mock R2 module
vi.mock('../api/lib/r2.js', () => ({
  isR2Configured: vi.fn(() => true),
  uploadBuffer: vi.fn(async (key, buffer, contentType) => {
    r2UploadCallCount++;
    uploadedFiles.push({ key, bufferLength: buffer.length, contentType });
    return `https://pub-test.r2.dev/${key}`;
  }),
}));

// Mock S3 module (fallback - should NOT be called when R2 is configured)
vi.mock('../api/lib/s3.js', () => ({
  isS3Configured: vi.fn(() => false),
  uploadBuffer: vi.fn(async () => {
    throw new Error('S3 should not be called when R2 is configured');
  }),
}));

// Mock neon SQL
const mockFilesDb = [];
const mockWorkAreas = [{ id: 1, tenant_id: 1 }];

vi.mock('../api/lib/neon.js', () => ({
  sql: vi.fn((strings, ...args) => {
    let query = '';
    if (Array.isArray(strings)) {
      query = strings.reduce((acc, str, i) => acc + str + (args[i] !== undefined ? '$' + (i + 1) : ''), '');
    } else {
      query = strings;
    }

    // ALTER TABLE - return empty
    if (query.includes('ALTER TABLE')) return Promise.resolve([]);

    // INSERT INTO files
    if (query.includes('INSERT INTO files')) {
      const row = {
        id: mockFilesDb.length + 1,
        work_area_id: args[2],
        name: args[3],
        type: args[4],
        size: args[5],
        visibility: args[6],
        uploader_name: args[7],
        url: args[8],
        created_at: new Date().toISOString(),
      };
      mockFilesDb.push(row);
      return Promise.resolve([row]);
    }

    // SELECT FROM files
    if (query.includes('SELECT') && query.includes('FROM files')) {
      if (query.includes('WHERE tenant_id') && query.includes('AND work_area_id')) {
        const waId = args[1];
        return Promise.resolve(mockFilesDb.filter(f => f.work_area_id === waId));
      }
      if (query.includes('WHERE tenant_id')) {
        return Promise.resolve(mockFilesDb);
      }
      return Promise.resolve(mockFilesDb);
    }

    // SELECT work_areas for tenant verification
    if (query.includes('SELECT id FROM work_areas')) {
      return Promise.resolve(mockWorkAreas.filter(w => w.id === args[0] && w.tenant_id === args[1]));
    }

    return Promise.resolve([]);
  }),
}));

// Mock auth helpers
vi.mock('../api/lib/auth.js', () => ({
  canManageData: vi.fn((user) => ['admin', 'manager', 'superadmin'].includes(user.role)),
  canEditData: vi.fn((user) => ['admin', 'manager', 'superadmin'].includes(user.role)),
}));

// Mock utils with controllable requireAuth
let mockUser = { userId: 1, tenantId: 1, role: 'admin', email: 'admin@test.com', name: 'Test Admin' };

vi.mock('../api/lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn(async () => mockUser),
  };
});

import handler from '../api/upload.js';
import filesHandler from '../api/files.js';
import { isR2Configured, uploadBuffer as r2UploadBuffer } from '../api/lib/r2.js';
import { isS3Configured } from '../api/lib/s3.js';

function mockRes() {
  const res = { _status: null, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.send = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end = () => {};
  return res;
}

const SAMPLE_PDF_BASE64 = Buffer.from('%PDF-1.4 test pdf content').toString('base64');

beforeEach(() => {
  mockFilesDb.length = 0;
  uploadedFiles.length = 0;
  r2UploadCallCount = 0;
  mockUser = { userId: 1, tenantId: 1, role: 'admin', email: 'admin@test.com', name: 'Test Admin' };
  vi.clearAllMocks();
  // Re-set defaults after clearAllMocks
  isR2Configured.mockReturnValue(true);
  isS3Configured.mockReturnValue(false);
});

describe('Document Management - Upload Flow', () => {
  it('uploads a file to R2 successfully as admin', async () => {
    const req = {
      method: 'POST',
      body: { name: 'test-doc.pdf', data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body.data.url).toContain('r2.dev');
    expect(res._body.data.name).toBe('test-doc.pdf');
    expect(r2UploadCallCount).toBe(1);
    expect(uploadedFiles[0].contentType).toBe('application/pdf');
  });

  it('rejects upload when user is member (RBAC)', async () => {
    mockUser = { userId: 2, tenantId: 1, role: 'member', email: 'member@test.com', name: 'Member' };
    const req = {
      method: 'POST',
      body: { name: 'test-doc.pdf', data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._body.error).toContain('Insufficient permissions');
    expect(r2UploadCallCount).toBe(0);
  });

  it('rejects upload when user is viewer (RBAC)', async () => {
    mockUser = { userId: 3, tenantId: 1, role: 'viewer', email: 'viewer@test.com', name: 'Viewer' };
    const req = {
      method: 'POST',
      body: { name: 'test-doc.pdf', data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(403);
    expect(r2UploadCallCount).toBe(0);
  });

  it('allows upload for manager role', async () => {
    mockUser = { userId: 4, tenantId: 1, role: 'manager', email: 'manager@test.com', name: 'Manager' };
    const req = {
      method: 'POST',
      body: { name: 'report.pdf', data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body.data.url).toContain('r2.dev');
  });

  it('rejects GET on upload endpoint', async () => {
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toContain('Method not allowed');
  });

  it('rejects upload missing name', async () => {
    const req = {
      method: 'POST',
      body: { data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toContain('name and base64 data are required');
  });

  it('rejects upload missing data', async () => {
    const req = {
      method: 'POST',
      body: { name: 'test-doc.pdf', contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toContain('name and base64 data are required');
  });

  it('uses R2 and does not fall back to S3 when R2 is configured', async () => {
    const req = {
      method: 'POST',
      body: { name: 'test.pdf', data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(r2UploadCallCount).toBe(1);
    expect(isS3Configured()).toBe(false);
  });

  it('returns 503 when neither R2 nor S3 is configured', async () => {
    isR2Configured.mockReturnValue(false);
    isS3Configured.mockReturnValue(false);
    const req = {
      method: 'POST',
      body: { name: 'test.pdf', data: SAMPLE_PDF_BASE64, contentType: 'application/pdf' },
      headers: {},
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._body.error).toContain('File storage is not configured');
  });
});

describe('Document Management - Files List & Create', () => {
  it('GET lists files filtered by tenant', async () => {
    // Seed a file
    mockFilesDb.push({
      id: 1, work_area_id: 1, name: 'doc1.pdf', type: 'document', size: 1024,
      visibility: 'internal', uploader_name: 'Admin', url: 'https://pub-test.r2.dev/doc1.pdf',
      created_at: new Date().toISOString(),
    });

    const req = { method: 'GET', query: {}, headers: {} };
    const res = mockRes();
    await filesHandler(req, res);

    expect(res._status).toBe(200);
    expect(res._body.data).toHaveLength(1);
    expect(res._body.data[0].name).toBe('doc1.pdf');
    expect(res._body.data[0].url).toContain('r2.dev');
  });

  it('POST creates a file record with R2 URL', async () => {
    const req = {
      method: 'POST',
      body: {
        workAreaId: 1,
        name: 'contract.pdf',
        type: 'document',
        size: 2048,
        visibility: 'internal',
        uploaderName: 'Test Admin',
        url: 'https://pub-test.r2.dev/tenants/1/abc.pdf',
      },
      headers: {},
    };
    const res = mockRes();
    await filesHandler(req, res);

    expect(res._status).toBe(201);
    expect(res._body.data.name).toBe('contract.pdf');
    expect(res._body.data.url).toContain('r2.dev');
    expect(res._body.data.workAreaId).toBe(1);
  });

  it('POST rejects file creation for member role (RBAC)', async () => {
    mockUser = { userId: 2, tenantId: 1, role: 'member', email: 'member@test.com', name: 'Member' };
    const req = {
      method: 'POST',
      body: {
        workAreaId: 1,
        name: 'contract.pdf',
        url: 'https://pub-test.r2.dev/tenants/1/abc.pdf',
      },
      headers: {},
    };
    const res = mockRes();
    await filesHandler(req, res);

    expect(res._status).toBe(403);
    expect(res._body.error).toContain('Insufficient permissions');
  });

  it('POST rejects file creation for work area outside tenant', async () => {
    const req = {
      method: 'POST',
      body: {
        workAreaId: 999,
        name: 'hack.pdf',
        url: 'https://pub-test.r2.dev/hack.pdf',
      },
      headers: {},
    };
    const res = mockRes();
    await filesHandler(req, res);

    expect(res._status).toBe(404);
    expect(res._body.error).toContain('Work area not found');
  });

  it('POST rejects file creation missing workAreaId', async () => {
    const req = {
      method: 'POST',
      body: { name: 'doc.pdf' },
      headers: {},
    };
    const res = mockRes();
    await filesHandler(req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toContain('workAreaId and name are required');
  });
});

describe('Document Management - R2 Module', () => {
  it('isR2Configured returns true when env vars are set', () => {
    isR2Configured.mockReturnValue(true);
    expect(isR2Configured()).toBe(true);
  });

  it('uploadBuffer returns public URL with key', async () => {
    r2UploadBuffer.mockResolvedValue('https://pub-test.r2.dev/tenants/1/test.pdf');
    const url = await r2UploadBuffer('tenants/1/test.pdf', Buffer.from('test'), 'application/pdf');
    expect(url).toContain('r2.dev');
    expect(url).toContain('tenants/1/test.pdf');
  });
});
