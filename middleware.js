import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Drive URLs are shareable and bookmarkable, so an unauthenticated hit on one
// must come back to it after login rather than dumping the user at the root.
// The layout's `getServerSession` guard still enforces auth — this only exists
// to carry the destination, which a server layout cannot see.
export async function middleware(req) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token) return NextResponse.next();
  } catch {
    // Never lock anyone out on a token-read failure; the layout decides.
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  url.pathname = '/login';
  url.search = `next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/upload/:path*'] };
