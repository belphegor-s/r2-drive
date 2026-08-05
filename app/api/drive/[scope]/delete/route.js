import { NextResponse } from 'next/server';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { deleteKeysBatched } from '@/lib/r2/listing';
import { ensureRootPrefixed, isTrashKey } from '@/lib/r2/keys';
import { trashKeys } from '@/lib/r2/trash';
import { invalidateUsageCache } from '@/lib/r2/usage';

export async function POST(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (keys.length === 0) return badRequest('keys[] required');

  // Default is a soft delete into the trash; callers opt into a hard delete.
  const permanent = body?.permanent === true;

  try {
    keys.forEach((k) => ensureRootPrefixed(k, scope.rootPrefix));

    // Something already in the trash can only be removed permanently.
    const alreadyTrashed = keys.some((k) => isTrashKey(k, scope.rootPrefix));

    if (permanent || alreadyTrashed) {
      const res = await deleteKeysBatched(scope.bucket, keys);
      invalidateUsageCache();
      return NextResponse.json({ ok: true, permanent: true, ...res });
    }

    const res = await trashKeys({ bucket: scope.bucket, rootPrefix: scope.rootPrefix, keys });
    invalidateUsageCache();
    return NextResponse.json({ ok: true, permanent: false, trashToken: res.token, deleted: res.count });
  } catch (err) {
    console.error('delete error:', err);
    return serverError('Failed to delete');
  }
}
