import { NextResponse } from 'next/server';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { listTrash, restoreTrash, purgeTrashEntry, emptyTrash, purgeExpiredTrash } from '@/lib/r2/trash';
import { invalidateUsageCache } from '@/lib/r2/usage';

export const dynamic = 'force-dynamic';

// Retention is opt-in: unset or 0 keeps trash forever.
const RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS || 0);
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function maybeSweep(scope) {
  if (!RETENTION_DAYS || Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = Date.now();
  try {
    await purgeExpiredTrash({ bucket: scope.bucket, rootPrefix: scope.rootPrefix, days: RETENTION_DAYS });
  } catch (err) {
    console.error('trash sweep failed:', err);
  }
}

export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  try {
    await maybeSweep(scope);
    const entries = await listTrash({ bucket: scope.bucket, rootPrefix: scope.rootPrefix });
    const bytes = entries.reduce((acc, e) => acc + e.size, 0);
    return NextResponse.json({ entries, bytes, retentionDays: RETENTION_DAYS || null });
  } catch (err) {
    console.error('trash list error:', err);
    return serverError('Failed to list trash');
  }
}

// Restore a single trash entry to its original location.
export async function POST(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const token = body?.token;
  if (!token) return badRequest('token required');

  try {
    const res = await restoreTrash({ bucket: scope.bucket, rootPrefix: scope.rootPrefix, token });
    invalidateUsageCache();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    if (err?.statusCode === 404) return NextResponse.json({ error: 'Trash entry not found' }, { status: 404 });
    if (err?.statusCode === 400) return badRequest(err.message);
    console.error('trash restore error:', err);
    return serverError('Failed to restore');
  }
}

// Permanently remove one entry ({ token }) or everything ({ all: true }).
export async function DELETE(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }

  try {
    const res = body?.all
      ? await emptyTrash({ bucket: scope.bucket, rootPrefix: scope.rootPrefix })
      : await purgeTrashEntry({ bucket: scope.bucket, rootPrefix: scope.rootPrefix, token: body?.token });
    invalidateUsageCache();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    if (err?.statusCode === 400) return badRequest(err.message);
    console.error('trash purge error:', err);
    return serverError('Failed to empty trash');
  }
}
