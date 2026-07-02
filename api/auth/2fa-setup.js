import { sendJson, handleCors, badRequest, requireAuth } from '../lib/utils.js';
import { sql } from '../lib/neon.js';
import crypto from 'crypto';

function generateSecret() {
  return crypto.randomBytes(20).toString('hex');
}

function generateTOTP(secret) {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const counter = Math.floor(epoch / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex'));
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const code = ((hash[offset] & 0x7f) << 24 |
    (hash[offset + 1] & 0xff) << 16 |
    (hash[offset + 2] & 0xff) << 8 |
    (hash[offset + 3] & 0xff)) % 1000000;

  return String(code).padStart(6, '0');
}

export { generateTOTP };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') { badRequest(res, 'Method not allowed'); return; }

  const user = await requireAuth(req, res);
  if (!user) return;

  const secret = generateSecret();
  // Store secret temporarily (confirmed on verify)
  await sql`UPDATE users SET totp_secret = ${secret}, totp_enabled = false WHERE id = ${user.userId}`;

  // Generate QR code URL (using Google Charts API for simplicity)
  const appName = 'Vereli';
  const otpauth = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(user.email)}?secret=${Buffer.from(secret, 'hex').toString('base64').replace(/=/g, '')}&issuer=${encodeURIComponent(appName)}`;

  sendJson(res, 200, {
    secret,
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`,
    manualEntry: Buffer.from(secret, 'hex').toString('base64').replace(/=/g, '').substring(0, 16),
  });
}
