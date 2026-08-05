// Copies the pdf.js worker into public/ so it is served same-origin.
//
// A same-origin worker keeps us inside the CSP (`worker-src` falls back to
// `default-src 'self'`) and avoids relying on bundler-specific `new URL(...)`
// asset emission. Runs on postinstall so the copy tracks the installed version.
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const to = join(root, 'public', 'pdf.worker.min.mjs');

if (!existsSync(from)) {
  // Dependencies not installed yet (or a --ignore-scripts install). Not fatal:
  // PDF thumbnails simply fall back to the generic icon.
  console.warn('[pdf-worker] pdfjs-dist not found, skipping worker copy');
  process.exit(0);
}

await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);
console.log('[pdf-worker] copied pdf.worker.min.mjs to public/');
