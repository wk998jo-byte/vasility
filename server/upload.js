import multer from 'multer';

let uploadMiddleware = null;
let cloudinary = null;

export async function initCloudinaryUpload() {
  // Prefer CLOUDINARY_URL; also support discrete vars from the Cloudinary dashboard.
  let raw = process.env.CLOUDINARY_URL || '';
  if (!raw.trim()) {
    const cloud = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const key = (process.env.CLOUDINARY_API_KEY || '').trim();
    const secret = (process.env.CLOUDINARY_API_SECRET || '').trim();
    if (cloud && key && secret) {
      raw = `cloudinary://${key}:${secret}@${cloud}`;
    }
  }

  if (!raw.trim()) {
    console.warn('[upload] CLOUDINARY_URL not set — photo uploads disabled. Add it to .env to enable.');
    return null;
  }

  const url = raw.trim().replace(/^CLOUDINARY_URL=/i, '').replace(/["'<>\s]/g, '');
  if (!url.startsWith('cloudinary://')) {
    console.warn('[upload] CLOUDINARY_URL is set but invalid — it must start with "cloudinary://". Photo uploads are disabled until it is fixed.');
    return null;
  }
  process.env.CLOUDINARY_URL = url;

  try {
    const mod = await import('cloudinary');
    cloudinary = mod.v2;
    cloudinary.config({ secure: true });
  } catch (err) {
    console.warn('[upload] Failed to initialize Cloudinary:', err.message);
    cloudinary = null;
    return null;
  }

  uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype?.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
  });

  console.log('[upload] Cloudinary ready (folder: ssc-facility-issues)');
  return uploadMiddleware;
}

export function getUploadMiddleware() {
  return uploadMiddleware;
}

export function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    if (!cloudinary) {
      reject(new Error('Cloudinary is not configured'));
      return;
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'ssc-facility-issues',
        resource_type: 'image',
        transformation: [{ width: 1200, crop: 'limit' }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
    stream.end(buffer);
  });
}
