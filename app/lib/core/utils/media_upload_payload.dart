import 'dart:convert';
import 'dart:typed_data';

import 'package:easy_localization/easy_localization.dart';
import 'package:image_picker/image_picker.dart';

/// Result of a completed media pick+encode.
class MediaUploadPayload {
  final String dataUrl;
  final String mimeType;
  final String fileType;
  final int byteLength;

  const MediaUploadPayload({
    required this.dataUrl,
    required this.mimeType,
    required this.fileType,
    required this.byteLength,
  });

  Map<String, dynamic> toRequestBody() => {
    'fileData': dataUrl,
    'fileType': fileType,
    'mimeType': mimeType,
  };
}

class MediaUploadException implements Exception {
  final String message;
  MediaUploadException(this.message);

  @override
  String toString() => message;
}

/// Client-side guard mirroring the server's limits (10MB image / 50MB video) so
/// users get immediate feedback instead of a failed upload after encoding.
const int kMaxImageBytes = 10 * 1024 * 1024;
const int kMaxVideoBytes = 50 * 1024 * 1024;

String _mimeFromName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4') || lower.endsWith('.mov')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'image/jpeg';
}

String _normalizedMime(XFile file, String type) {
  var mime = file.mimeType?.trim().toLowerCase();
  if (mime == 'image/jpg') mime = 'image/jpeg';
  final allowed = type == 'image'
      ? const ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : const ['video/mp4', 'video/webm', 'video/quicktime'];
  if (mime == null || !allowed.contains(mime)) {
    mime = _mimeFromName(file.name);
  }
  return mime;
}

/// Builds the exact upload contract from an already selected file. This keeps
/// posts, products, documents and payment proofs on one MIME-normalization path.
Future<MediaUploadPayload> payloadFromXFile(
  XFile file, {
  required String fileType,
}) async {
  final bytes = await file.readAsBytes();
  final mime = _normalizedMime(file, fileType);
  return payloadFromBytes(bytes, mime, fileType);
}

Future<MediaUploadPayload> buildImageUploadPayload({
  int imageQuality = 80,
  double maxWidth = 1800,
  ImageSource source = ImageSource.gallery,
}) async {
  final picked = await ImagePicker().pickImage(
    source: source,
    imageQuality: imageQuality,
    maxWidth: maxWidth,
  );
  if (picked == null) throw MediaUploadException(tr('err_no_image_picked'));
  final bytes = await picked.readAsBytes();
  final mime = picked.mimeType ?? _mimeFromName(picked.name);
  _validate(mime, 'image', bytes.length);
  return MediaUploadPayload(
    dataUrl: 'data:$mime;base64,${base64Encode(bytes)}',
    mimeType: mime,
    fileType: 'image',
    byteLength: bytes.length,
  );
}

/// Video uploads are size-capped; oversized picks are rejected before encode.
Future<MediaUploadPayload> buildVideoUploadPayload() async {
  final picked = await ImagePicker().pickVideo(source: ImageSource.gallery);
  if (picked == null) throw MediaUploadException(tr('err_no_video_picked'));
  final bytes = await picked.readAsBytes();
  const mime = 'video/mp4';
  _validate(mime, 'video', bytes.length);
  return MediaUploadPayload(
    dataUrl: 'data:$mime;base64,${base64Encode(bytes)}',
    mimeType: mime,
    fileType: 'video',
    byteLength: bytes.length,
  );
}

void _validate(String mime, String type, int byteLength) {
  final isImage = mime.startsWith('image/');
  final allowed = isImage
      ? const ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : const ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.contains(mime)) {
    throw MediaUploadException(
      isImage
          ? tr('err_unsupported_image_format')
          : tr('err_unsupported_video_format'),
    );
  }
  final max = type == 'image' ? kMaxImageBytes : kMaxVideoBytes;
  if (byteLength > max) {
    throw MediaUploadException(
      type == 'image' ? tr('err_image_too_large') : tr('err_video_too_large'),
    );
  }
}

/// Convenience for tests / pre-encoded payloads.
MediaUploadPayload payloadFromBytes(Uint8List bytes, String mime, String type) {
  _validate(mime, type, bytes.length);
  return MediaUploadPayload(
    dataUrl: 'data:$mime;base64,${base64Encode(bytes)}',
    mimeType: mime,
    fileType: type,
    byteLength: bytes.length,
  );
}
