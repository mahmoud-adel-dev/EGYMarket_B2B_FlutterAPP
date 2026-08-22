import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { uploadToCloudinary } from '@/lib/media/cloudinary';
import { checkRateLimit } from '@/lib/auth/rate_limit';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const allowedVideoMimes = ['video/mp4', 'video/webm', 'video/quicktime'];

/**
 * Magic-byte sniffing. The client-declared MIME type is never trusted on its own:
 * the leading bytes of the decoded payload must match the declared container.
 */
function detectSignature(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 12 && startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  // MP4: bytes 4-7 are 'ftyp' (ISO base media). QuickTime MOV shares this container.
  if (bytes.length >= 12 && startsWith([0x66, 0x74, 0x79, 0x70], 4)) return 'video/mp4';
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'; // EBML/Matroska
  return null;
}

/**
 * POST /api/upload
 * Protected endpoint: uploads image or video media to Cloudinary/CDN.
 * Validates the data-URL envelope, MIME allow-lists, magic-byte signatures, and size
 * limits before any external call. Client-declared types are never trusted alone.
 */
export const POST = withAuth([], async (req: NextRequest, context, session) => {
  const rateLimit = await checkRateLimit(req, 15, 60 * 1000);
  if (rateLimit.isRateLimited) return rateLimit.response!;

  try {
    const body = await req.json();
    const { fileData, fileType, mimeType } = body;

    if (!fileData || typeof fileData !== 'string') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'File payload data is required' },
        { status: 400 }
      );
    }

    const commaIndex = fileData.indexOf(',');
    const header = commaIndex > 0 ? fileData.slice(0, commaIndex) : '';
    const declaredMime = header.startsWith('data:') ? header.slice(5, header.indexOf(';')) : '';

    const type = fileType === 'video' ? 'video' : 'image';

    // Envelope + allow-list validation.
    // `header` is deliberately sliced *before* the comma. The previous check
    // incorrectly expected that removed comma to still be present, so every
    // valid data URL was rejected before Cloudinary was ever called.
    if (commaIndex <= 0 || header !== `data:${declaredMime};base64`) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'File data must be a base64 data URL' },
        { status: 400 }
      );
    }
    const mimeList = type === 'image' ? allowedImageMimes : allowedVideoMimes;
    if (!declaredMime || !mimeList.includes(declaredMime.toLowerCase())) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: type === 'image'
            ? 'Invalid image format. Allowed: JPG, PNG, WEBP, GIF'
            : 'Invalid video format. Allowed: MP4, WEBM, MOV',
        },
        { status: 400 }
      );
    }

    // Size validation (base64 → byte estimate) BEFORE decoding anything large.
    const base64Payload = fileData.slice(commaIndex + 1);
    const sizeInBytes = Math.floor((base64Payload.length * 3) / 4);
    const maxBytes = type === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (sizeInBytes > maxBytes) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: type === 'image'
            ? 'Image size exceeds maximum limit of 10MB'
            : 'Video size exceeds maximum limit of 50MB',
        },
        { status: 400 }
      );
    }

    // Magic-byte verification on a small prefix — catches mislabeled payloads.
    const buffer = Buffer.from(base64Payload.slice(0, 4104), 'base64');
    const signature = detectSignature(buffer);
    const compatible =
      signature === declaredMime.toLowerCase() ||
      (signature === 'video/mp4' && declaredMime.toLowerCase() === 'video/quicktime');
    if (!signature || !compatible) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'File content does not match its declared media type' },
        { status: 400 }
      );
    }

    const uploadResult = await uploadToCloudinary(fileData, type, session.user.id);

    return NextResponse.json({
      success: true,
      media: {
        id: uploadResult.public_id,
        url: uploadResult.secure_url,
        thumbnailUrl: uploadResult.secure_url,
        type: uploadResult.resource_type,
        mimeType: declaredMime,
        size: uploadResult.bytes,
        width: uploadResult.width,
        height: uploadResult.height,
        duration: uploadResult.duration,
        uploadedBy: session.user.id,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    // Client mistakes (malformed JSON/data URLs) surface as 400; everything else is a
    // sanitized 500. Never echo internal error text.
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Bad Request', message: 'Malformed request body' }, { status: 400 });
    }
    console.error('[upload]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'An unexpected server error occurred' }, { status: 500 });
  }
});
