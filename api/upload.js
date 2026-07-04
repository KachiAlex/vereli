import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';
import { sql } from './lib/neon.js';
import { uploadBuffer as uploadS3Buffer, isS3Configured } from './lib/s3.js';
import { uploadBase64, isCloudinaryConfigured } from './lib/cloudinary.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
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
    if (isCloudinaryConfigured()) {
      url = await uploadBase64(name, data, contentType);
    } else if (isS3Configured()) {
      const buffer = Buffer.from(data, 'base64');
      const ext = name.split('.').pop() || 'bin';
      const key = `tenants/${user.tenantId || 'global'}/${crypto.randomUUID()}.${ext}`;
      url = await uploadS3Buffer(key, buffer, contentType || 'application/octet-stream');
    } else {
      sendJson(res, 503, { error: 'File storage is not configured. Set CLOUDINARY_URL or S3 credentials.' });
      return;
    }

    sendJson(res, 200, { data: { url, name } });
  } catch (err) {
    console.error('Upload error:', err);
    sendJson(res, 500, { error: 'Upload failed: ' + err.message });
  }
}
