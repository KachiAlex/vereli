import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET_NAME;
const publicUrlBase = process.env.S3_PUBLIC_URL || '';

const s3 = endpoint
  ? new S3Client({
      endpoint,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    })
  : null;

export function isS3Configured() {
  return !!s3 && !!bucket;
}

export async function uploadBuffer(key, buffer, contentType) {
  if (!s3 || !bucket) throw new Error('S3 is not configured');
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return publicUrlBase ? `${publicUrlBase}/${key}` : `${endpoint}/${bucket}/${key}`;
}

export async function getPresignedUploadUrl(key, contentType) {
  if (!s3 || !bucket) throw new Error('S3 is not configured');
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });
  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
}

export async function getPresignedDownloadUrl(key) {
  if (!s3 || !bucket) throw new Error('S3 is not configured');
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
}
