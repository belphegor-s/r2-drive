export default function manifest() {
  return {
    name: 'R2 Drive',
    short_name: 'Drive',
    description: 'A personal file drive on Cloudflare R2.',
    start_url: '/upload/private',
    display: 'standalone',
    background_color: '#101113',
    theme_color: '#101113',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
