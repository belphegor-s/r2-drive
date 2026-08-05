'use client';

import { useEffect, useRef, useState } from 'react';
import { driveApi } from '@/app/lib/driveClient';
import { enqueueRender, MAX_PDF_BYTES, MAX_IMAGE_BYTES } from '@/app/lib/thumbs';
import { getThumb, putThumb, pruneThumbs } from '@/app/lib/thumbStore';

// Failures are remembered for the session so a broken, encrypted or undecodable
// file is not re-downloaded every time its tile scrolls back into view.
const failed = new Set();

/**
 * Lazily produce a grid thumbnail.
 *
 * Work only starts once the tile is near the viewport, and only after the
 * IndexedDB cache misses. Renderers are imported on demand so a folder with no
 * PDFs never pays for pdf.js.
 *
 * @param {{key: string, size: number, name: string, url: string|null}|null} file
 * @param {string} scope
 * @param {'pdf'|'image'|null} kind  null disables the hook
 * @returns {{ ref, thumb: string|null, loading: boolean, locked: boolean }}
 */
export default function useThumbnail(file, scope, kind) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  const key = file?.key;
  const size = file?.size;
  const publicUrl = file?.url || null;

  useEffect(() => {
    setThumb(null);
    setLoading(false);
    setLocked(false);

    if (!kind || !key) return undefined;

    const limit = kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    if (size != null && size > limit) return undefined;
    if (failed.has(key)) return undefined;

    const el = ref.current;
    if (!el) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    let started = false;

    const start = async () => {
      if (started || cancelled) return;
      started = true;

      const cached = await getThumb(key, size);
      if (cancelled) return;
      if (cached) {
        setThumb(cached);
        return;
      }

      setLoading(true);
      try {
        const dataUrl = await enqueueRender(async () => {
          // Private objects have no public URL; sign one on demand. Signing is
          // local to the server — it costs no R2 operation.
          const url = publicUrl || (await driveApi.previewUrl(scope, key)).url;
          if (cancelled) throw new DOMException('Aborted', 'AbortError');

          const render =
            kind === 'pdf'
              ? (await import('@/app/lib/pdfThumb')).renderPdfThumbnail
              : (await import('@/app/lib/imageThumb')).renderImageThumbnail;

          return render(url, { signal: controller.signal });
        }, controller.signal);

        if (cancelled) return;
        setThumb(dataUrl);
        putThumb(key, size, dataUrl).then(pruneThumbs);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        failed.add(key);
        // An encrypted PDF is expected, not a fault — the tile shows a lock.
        if (err?.name === 'PasswordException') {
          if (!cancelled) setLocked(true);
        } else {
          console.warn('[thumb] failed for', key, err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Render a little before the tile is on screen so scrolling feels seamless.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      controller.abort();
    };
  }, [kind, key, size, publicUrl, scope]);

  return { ref, thumb, loading, locked };
}
