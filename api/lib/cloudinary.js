import { v2 as cloudinary } from 'cloudinary';

// Auto-configures from CLOUDINARY_URL env var if present
// Format: cloudinary://api_key:api_secret@cloud_name

export function isCloudinaryConfigured() {
  return !!process.env.CLOUDINARY_URL;
}

export async function uploadBase64(name, base64Data, contentType) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary not configured');
  }

  const prefix = contentType ? `data:${contentType};base64,` : 'data:application/octet-stream;base64,';
  const dataUri = prefix + base64Data;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
    folder: 'vereli',
    resource_type: 'auto',
  });

  return result.secure_url;
}

export async function uploadBuffer(key, buffer, contentType) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary not configured');
  }

  const base64 = buffer.toString('base64');
  return uploadBase64(key, base64, contentType);
}
