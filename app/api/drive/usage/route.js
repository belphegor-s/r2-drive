import { NextResponse } from 'next/server';
import { requireAuth, serverError } from '@/lib/r2/guard';
import { getUsage } from '@/lib/r2/usage';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';

  try {
    const usage = await getUsage({ force });
    return NextResponse.json(usage, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    console.error('usage error:', err);
    return serverError('Failed to compute usage');
  }
}
