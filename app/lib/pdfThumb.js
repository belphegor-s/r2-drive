// First-page PDF thumbnails, rendered in the browser with pdf.js.
//
// Why client-side: R2 stores bytes, it cannot rasterise. Doing this on the
// server would mean shipping a PDF renderer into a serverless function and
// paying a Class B read plus compute for every tile. In the browser the render
// happens once per object and the result is cached in IndexedDB, so revisiting
// a folder costs nothing.
//
// pdf.js is loaded lazily — it is ~350 KB and most folders contain no PDFs.
import { TARGET_WIDTH, drawToThumbnail, canvasToDataUrl } from './thumbs';

let pdfjsPromise = null;

async function getPdfjs() {
  pdfjsPromise ||= import('pdfjs-dist').then((pdfjs) => {
    // Same-origin worker, copied into public/ by scripts/copy-pdf-worker.mjs.
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * Render page 1 of a PDF to a JPEG data URL.
 * @param {string} url         fetchable URL (public URL or presigned)
 * @param {AbortSignal} signal
 * @returns {Promise<string>}  data:image/jpeg;base64,…
 */
export async function renderPdfThumbnail(url, { signal } = {}) {
  const pdfjs = await getPdfjs();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = pdfjs.getDocument({
    url,
    // Only the first page is needed; let pdf.js range-request what it can.
    disableAutoFetch: true,
    disableStream: false,
    isEvalSupported: false,
  });

  const onAbort = () => task.destroy();
  signal?.addEventListener('abort', onAbort, { once: true });

  let doc;
  try {
    doc = await task.promise;
    const page = await doc.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

    const { canvas, ctx } = drawToThumbnail(viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const dataUrl = canvasToDataUrl(canvas);
    page.cleanup();
    return dataUrl;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      await doc?.cleanup();
    } catch {
      // best effort
    }
    try {
      await task.destroy();
    } catch {
      // already destroyed by the abort handler
    }
  }
}
