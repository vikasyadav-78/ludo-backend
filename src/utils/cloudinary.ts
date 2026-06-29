import cloudinary from '../config/cloudinary';
import { UploadApiResponse } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../config/logger';

export const uploadBufferToCloudinary = (
  fileBuffer: Buffer,
  folder: string
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) {
          logger.warn(`Cloudinary upload failed: ${error.message}. Falling back to local storage.`);
          
          try {
            // Local fallback logic
            const ext = 'jpg';
            const filename = `${crypto.randomUUID()}.${ext}`;
            const uploadsDir = path.join(process.cwd(), 'uploads', folder);
            
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, fileBuffer);
            
            const port = process.env.PORT || '5000';
            // Construct the local backend static URL
            const localUrl = `http://localhost:${port}/uploads/${folder}/${filename}`;
            
            const fallbackResult: Partial<UploadApiResponse> = {
              secure_url: localUrl,
              public_id: `${folder}/${filename}`,
              width: 0,
              height: 0,
              format: ext,
              bytes: fileBuffer.length
            };
            
            resolve(fallbackResult as UploadApiResponse);
          } catch (localError: any) {
            reject(new Error(`Both Cloudinary and local fallback failed: ${localError.message}`));
          }
        } else if (!result) {
          reject(new Error('Cloudinary response was empty'));
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Delete an asset from Cloudinary using its public ID
 */
export const deleteCloudinaryImage = async (publicId: string): Promise<any> => {
  try {
    if (!publicId || publicId.includes('http://') || publicId.includes('https://')) {
      return; // Ignore if empty or just a URL (local fallback)
    }
    logger.info(`Deleting image from Cloudinary: ${publicId}`);
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.error(`Failed to delete image from Cloudinary (${publicId}):`, error);
  }
};
