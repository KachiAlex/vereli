import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { canManageData } from './lib/auth.js';
import { uploadBuffer as uploadR2Buffer, isR2Configured } from './lib/r2.js';
import { uploadBuffer as uploadS3Buffer, isS3Configured } from './lib/s3.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  if (!canManageData(user)) {
    sendJson(res, 403, { error: 'Insufficient permissions to upload files' });
    return;
  }

  const { name, data, contentType } = req.body || {};
  if (!name || !data) {
    badRequest(res, 'name and base64 data are required');
    return;
  }

  try {
    // Ensure files table has url column
    await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS url TEXT`;

    let url = '';
    const buffer = Buffer.from(data, 'base64');
    const ext = name.split('.').pop() || 'bin';
    const key = `tenants/${user.tenantId || 'global'}/${crypto.randomUUID()}.${ext}`;
    if (isR2Configured()) {
      url = await uploadR2Buffer(key, buffer, contentType || 'application/octet-stream');
    } else if (isS3Configured()) {
      url = await uploadS3Buffer(key, buffer, contentType || 'application/octet-stream');
    } else {
      sendJson(res, 503, { error: 'File storage is not configured. Set R2 or S3 credentials.' });
      return;
    }

    sendJson(res, 200, { data: { url, name } });
  } catch (err) {
    console.error('Upload error:', err);
    sendJson(res, 500, { error: 'Upload failed: ' + err.message });
  }
}
