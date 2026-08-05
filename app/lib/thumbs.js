// Shared plumbing for grid thumbnails (PDF first pages and private images).

export const TARGET_WIDTH = 320; // rendered px; tiles are ~180 CSS px, crisp at 2x
export const JPEG_QUALITY = 0.72;

// Rendering means downloading the whole object. Above these we keep the icon.
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// Rendering is CPU-heavy and each job downloads a file; two at a time keeps the
// grid responsive and avoids a burst of parallel reads against R2.
const MAX_CONCURRENT = 2;
let active = 0;
const queue = [];

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    if (job.signal?.aborted) {
      // Must settle: skipping it would leave the caller's promise pending
      // forever, and with it the tile's loading state.
      job.reject(new DOMException('Aborted', 'AbortError'));
      continue;
    }
    active += 1;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

/** Queue a thumbnail render behind the global concurrency limit. */
export function enqueueRender(run, signal) {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject, signal });
    pump();
  });
}

/** Canvas scaled to TARGET_WIDTH, preserving aspect, on an opaque white backing. */
export function drawToThumbnail(width, height) {
  const scale = Math.min(1, TARGET_WIDTH / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext('2d', { alpha: false });
  // Transparent sources (PNG, PDF pages) would otherwise composite onto black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return { canvas, ctx };
}

export function canvasToDataUrl(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  // Free the backing store immediately; grids can hold a lot of these.
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}
