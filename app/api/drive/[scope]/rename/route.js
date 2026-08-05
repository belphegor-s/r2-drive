import { NextResponse } from 'next/server';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { renameKey, renameFolder } from '@/lib/r2/transfer';
import { ensureRootPrefixed, safeSegment, isReservedRelPath } from '@/lib/r2/keys';
import { invalidateUsageCache } from '@/lib/r2/usage';

export async function POST(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const { key, prefix, newName } = body || {};
  const cleanName = safeSegment(newName);
  if (!cleanName) return badRequest('newName required');

  if (cleanName === '.trash') return badRequest('That name is reserved');

  try {
    if (key) {
      ensureRootPrefixed(key, scope.rootPrefix);
      const res = await renameKey({ bucket: scope.bucket, scopeRoot: scope.rootPrefix, key, newName: cleanName });
      invalidateUsageCache();
      return NextResponse.json({ ok: true, ...res });
    }
    if (prefix !== undefined) {
      if (isReservedRelPath(prefix)) return badRequest('That folder is reserved');
      const res = await renameFolder({ bucket: scope.bucket, scopeRoot: scope.rootPrefix, prefixRel: prefix, newName: cleanName });
      invalidateUsageCache();
      return NextResponse.json({ ok: true, ...res });
    }
    return badRequest('key or prefix required');
  } catch (err) {
    console.error('rename error:', err);
    return serverError('Failed to rename');
  }
}
