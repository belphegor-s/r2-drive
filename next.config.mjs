/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com;
              style-src 'self' 'unsafe-inline';
              img-src 'self' blob: data: storage.procd.cc *.r2.cloudflarestorage.com;
              font-src 'self' data:;
              connect-src 'self' storage.procd.cc *.r2.cloudflarestorage.com https://vitals.vercel-insights.com;
              frame-src 'self' storage.procd.cc *.r2.cloudflarestorage.com docs.google.com;
              media-src 'self' storage.procd.cc *.r2.cloudflarestorage.com;
              object-src 'none';
              frame-ancestors 'none';
              upgrade-insecure-requests;
            `
              .replace(/\s{2,}/g, ' ')
              .trim(),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
