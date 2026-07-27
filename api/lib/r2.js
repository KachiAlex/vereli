import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET_NAME;
const publicUrlBase = process.env.R2_PUBLIC_URL || '';

const r2 = accountId && bucket
  ? new S3Client({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: false,
    })
  : null;

export function isR2Configured() {
  return !!r2 && !!bucket;
}

export async function uploadBuffer(key, buffer, contentType) {
  if (!r2 || !bucket) throw new Error('R2 is not configured');
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return publicUrlBase ? `${publicUrlBase}/${key}` : `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

export async function uploadBase64(name, base64Data, contentType) {
  if (!r2 || !bucket) throw new Error('R2 is not configured');
  const buffer = Buffer.from(base64Data, 'base64');
  return uploadBuffer(name, buffer, contentType);
}

export async function deleteObject(key) {
  if (!r2 || !bucket) throw new Error('R2 is not configured');
  await r2.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}

export async function getPresignedDownloadUrl(key) {
  if (!r2 || !bucket) throw new Error('R2 is not configured');
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}
