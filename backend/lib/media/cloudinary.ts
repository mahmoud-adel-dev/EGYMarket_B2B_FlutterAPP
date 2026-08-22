import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  resource_type: 'image' | 'video';
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
}

export async function uploadToCloudinary(
  fileDataUrl: string,
  resourceType: 'image' | 'video' = 'image',
  uploaderId: string
): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Media storage is not configured');
    }
    return uploadToLocalDevelopmentStorage(fileDataUrl, resourceType, uploaderId);
  }
  if (!fileDataUrl.startsWith('data:')) {
    throw new Error('Only inline uploaded file data is accepted');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `seals/${uploaderId}/${resourceType}/${randomUUID()}`;
  const signaturePayload = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash('sha1').update(signaturePayload).digest('hex');
  const formData = new FormData();
  formData.append('file', fileDataUrl);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('public_id', publicId);
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || 'Media upload failed');
  }
  return {
    public_id: data.public_id,
    secure_url: data.secure_url,
    resource_type: resourceType,
    format: data.format,
    bytes: data.bytes,
    width: data.width,
    height: data.height,
    duration: data.duration,
  };
}

async function uploadToLocalDevelopmentStorage(
  fileDataUrl: string,
  resourceType: 'image' | 'video',
  uploaderId: string
): Promise<CloudinaryUploadResult> {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(fileDataUrl);
  if (!match) throw new Error('Invalid inline media payload');
  const mimeType = match[1].toLowerCase();
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  const extension = extensions[mimeType];
  if (!extension) throw new Error('Unsupported local media format');

  const bytes = Buffer.from(match[2], 'base64');
  const publicId = `seals/${uploaderId}/${resourceType}/${randomUUID()}`;
  const fileName = `${publicId.replaceAll('/', '-')}.${extension}`;
  const uploadDirectory = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, fileName), bytes, { flag: 'wx' });

  const baseUrl = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    public_id: publicId,
    secure_url: `${baseUrl}/uploads/${fileName}`,
    resource_type: resourceType,
    format: extension,
    bytes: bytes.length,
  };
}
