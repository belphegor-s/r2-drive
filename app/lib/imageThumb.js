// Downscaled thumbnails for images that have no public URL.
//
// The private bucket serves images through presigned URLs, whose query string
// changes on every request — so the browser HTTP cache never hits and the full
// original would be re-downloaded on every visit to a folder. Rendering a small
// JPEG once and keeping it in IndexedDB is what makes private thumbnails
// affordable; public-scope images skip all of this and use their stable CDN URL
// directly.
import { drawToThumbnail, canvasToDataUrl } from './thumbs';

// Vector and exotic formats: createImageBitmap either refuses them or the
// browser cannot decode them at all. Callers fall back to the plain icon.
const UNRENDERABLE = new Set(['svg', 'heic', 'heif', 'avif']);

export function isRenderableImage(name = '') {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return !UNRENDERABLE.has(ext);
}

/**
 * Fetch an image and re-encode it as a small JPEG data URL.
 * @param {string} url
 * @param {AbortSignal} signal
 */
export async function renderImageThumbnail(url, { signal } = {}) {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);

  const blob = await res.blob();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('Image could not be decoded');
  }

  try {
    const { canvas, ctx } = drawToThumbnail(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasToDataUrl(canvas);
  } finally {
    bitmap.close?.();
  }
}
