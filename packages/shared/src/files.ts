import type { FileCategory } from './enums';

/** MIME types accepted for upload, grouped by category. Detection is done from file bytes on the server. */
export const ALLOWED_MIME: Record<Exclude<FileCategory, 'other'>, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/aac'],
  pdf: ['application/pdf'],
  document: [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/msword',
    'application/vnd.ms-excel',
  ],
  archive: ['application/zip', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar', 'application/vnd.rar', 'application/x-rar-compressed'],
};

export function categoryForMime(mime: string): FileCategory {
  for (const [cat, list] of Object.entries(ALLOWED_MIME)) if (list.includes(mime)) return cat as FileCategory;
  return 'other';
}

/** MIME types the browser may render inline (everything else is forced to download). */
export const INLINE_SAFE_MIME = new Set([
  ...ALLOWED_MIME.image,
  ...ALLOWED_MIME.video,
  ...ALLOWED_MIME.audio,
  'application/pdf',
]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
