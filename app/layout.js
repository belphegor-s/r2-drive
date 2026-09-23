import { Inter } from 'next/font/google';
import './globals.css';
import AuthProvider from './components/AuthProvider';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({ subsets: ['latin'] });

const description =
  'A personal drive for Cloudflare R2. Public files served from the edge, private ones behind signed links.';

// OG/Twitter image URLs must be absolute. NEXTAUTH_URL is already the canonical origin.
const siteUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'R2 Drive', template: '%s · R2 Drive' },
  description,
  applicationName: 'R2 Drive',
  authors: [{ name: 'Ayush Sharma' }],
  // Single-user app: previews when a link is shared, but keep it out of search.
  robots: { index: false, follow: false },
  openGraph: { type: 'website', siteName: 'R2 Drive', title: 'R2 Drive', description, locale: 'en_US' },
  twitter: { card: 'summary_large_image', title: 'R2 Drive', description },
  appleWebApp: { capable: true, title: 'R2 Drive', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport = {
  themeColor: '#101113',
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Analytics />
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
