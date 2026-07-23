/**
 * Media classification helpers shared by the main process (streaming server)
 * and the renderer (player UI). Pure, dependency-free so both sides can import it.
 */

const VIDEO_EXTS = new Set([
  'mp4', 'm4v', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'ogv', 'mpg', 'mpeg', 'ts', 'm2ts', '3gp',
]);
const AUDIO_EXTS = new Set([
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'wma', 'aiff',
]);

export type MediaKind = 'video' | 'audio' | 'other';

// Image extensions the room file list previews as thumbnails. Kept SEPARATE
// from classifyMediaKind (which drives the streaming/cast path, where an image
// must stay 'other' — not playable): images are a display concern, not media.
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'tif', 'tiff']);

/** True for a still-image file (thumbnail/lightbox candidate). */
export function isImage(name: string): boolean {
  return IMAGE_EXTS.has(name.split('.').pop()?.toLowerCase() || '');
}

// Containers/codecs the built-in Chromium player can usually play directly,
// so they can be served as-is (no transcoding). Everything else streamable
// (avi, mkv, wmv, flv, mpg, ts, wma, …) is transcoded on the fly via ffmpeg.
const DIRECT_VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv']);
const DIRECT_AUDIO_EXTS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac']);

/** Classify a file as streamable video/audio by extension. */
export function classifyMediaKind(name: string): MediaKind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'other';
}

/** True if the file can be opened in the in-app player. */
export function isStreamable(name: string): boolean {
  return classifyMediaKind(name) !== 'other';
}

/**
 * True if the file is likely playable directly by Chromium (by container).
 * A direct play can still fail on an unsupported codec (e.g. HEVC in an MP4) —
 * the player falls back to transcoding in that case.
 */
export function isDirectlyPlayable(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return DIRECT_VIDEO_EXTS.has(ext) || DIRECT_AUDIO_EXTS.has(ext);
}
