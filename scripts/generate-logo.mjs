// Rasterises assets/logo/*.svg into the PNG/WebP/ICO set.
//
//   node scripts/generate-logo.mjs
//
// Run after editing the SVGs. Outputs are committed, so this is not part of the
// build. `sharp` arrives as a Next.js dependency; nothing extra to install.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'logo');
const out = join(src, 'export');

const LOGO_SIZES = [16, 32, 48, 64, 128, 180, 256, 512, 1024];
const MASKABLE_SIZES = [192, 512];
const ICO_SIZES = [16, 32, 48];

// Render from the vector at each size rather than downscaling one bitmap.
const render = (svg, px) => sharp(svg, { density: Math.ceil((72 * px) / 64) }).resize(px, px);

// ICO with embedded PNGs (supported everywhere since Vista).
function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ px, buf }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(px >= 256 ? 0 : px, e);
    header.writeUInt8(px >= 256 ? 0 : px, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.buf)]);
}

const logo = await readFile(join(src, 'logo.svg'));
const maskable = await readFile(join(src, 'logo-maskable.svg'));
await mkdir(out, { recursive: true });

for (const px of LOGO_SIZES) {
  await render(logo, px).png().toFile(join(out, `logo-${px}.png`));
}
for (const px of MASKABLE_SIZES) {
  await render(maskable, px).png().toFile(join(out, `logo-maskable-${px}.png`));
}
await render(logo, 512).webp({ lossless: true }).toFile(join(out, 'logo-512.webp'));
await render(logo, 1024).jpeg({ quality: 92 }).flatten({ background: '#101113' }).toFile(join(out, 'logo-1024.jpg'));

const icoPngs = await Promise.all(ICO_SIZES.map(async (px) => ({ px, buf: await render(logo, px).png().toBuffer() })));
await writeFile(join(out, 'favicon.ico'), ico(icoPngs));

// Served copies: /favicon.ico for clients that never read <link rel=icon>, and
// the manifest's raster icons for Android installs.
const pub = join(root, 'public');
await copyFile(join(out, 'favicon.ico'), join(pub, 'favicon.ico'));
for (const px of MASKABLE_SIZES) {
  await copyFile(join(out, `logo-maskable-${px}.png`), join(pub, `icon-maskable-${px}.png`));
}
await copyFile(join(out, 'logo-512.png'), join(pub, 'icon-512.png'));

console.log(`[logo] wrote ${LOGO_SIZES.length + MASKABLE_SIZES.length + 3} files to assets/logo/export`);
