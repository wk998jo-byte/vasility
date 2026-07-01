import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

let uploadMiddleware = null;

export function initCloudinaryUpload() {
  if (!process.env.CLOUDINARY_URL) {
    return null;
  }

  cloudinary.config({ secure: true });

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

  return uploadMiddleware;
}

export function getUploadMiddleware() {
  return uploadMiddleware;
}

export function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
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
