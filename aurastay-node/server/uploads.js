import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { uploadDir } from './store.js';

const MAX_BYTES = 5 * 1024 * 1024;

/** Detect an allowed image type from magic bytes. */
export function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * Validate an uploaded image against its declared MIME type, then persist it
 * with a random filename. Returns the stored filename and public URL.
 */
export function storeImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) return null;
  if (file.size > MAX_BYTES) throw new Error('Photo must be smaller than 5 MB.');
  const detected = detectImage(file.buffer);
  if (!detected) throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.mimetype && file.mimetype !== detected.mime) {
    throw new Error('The attachment must be a valid image.');
  }
  const filename = `${crypto.randomUUID()}.${detected.ext}`;
  fs.writeFileSync(path.join(uploadDir(), filename), file.buffer);
  return { filename, url: `/uploads/${filename}`, mime: detected.mime };
}

export function removeImage(filename) {
  if (!filename || typeof filename !== 'string') return;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return;
  const target = path.join(uploadDir(), filename);
  try {
    fs.unlinkSync(target);
  } catch {
    // Already gone.
  }
}

export function imageUrl(filename) {
  return filename ? `/uploads/${filename}` : null;
}

export const MAX_UPLOAD_BYTES = MAX_BYTES;
