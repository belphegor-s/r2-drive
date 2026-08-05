import { NextResponse } from 'next/server';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { copyKeys, copyFolderInto } from '@/lib/r2/transfer';
import { ensureRootPrefixed, isReservedRelPath } from '@/lib/r2/keys';
import { invalidateUsageCache } from '@/lib/r2/usage';

export async function POST(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const { keys = [], prefixes = [], destPrefix = '' } = body || {};

  const fileKeys = Array.isArray(keys) ? keys : [];
  const folderPrefixes = Array.isArray(prefixes) ? prefixes : [];
  if (fileKeys.length === 0 && folderPrefixes.length === 0) {
    return badRequest('keys[] or prefixes[] required');
  }
  if (isReservedRelPath(destPrefix) || folderPrefixes.some(isReservedRelPath)) {
    return badRequest('That location is reserved');
  }

  try {
    fileKeys.forEach((k) => ensureRootPrefixed(k, scope.rootPrefix));

    const copied = fileKeys.length
      ? await copyKeys({ bucket: scope.bucket, keys: fileKeys, destRel: destPrefix, scopeRoot: scope.rootPrefix })
      : [];

    const folders = [];
    for (const prefix of folderPrefixes) {
      folders.push(await copyFolderInto({
        bucket: scope.bucket,
        scopeRoot: scope.rootPrefix,
        srcPrefixRel: prefix,
        destParentRel: destPrefix,
      }));
    }

    invalidateUsageCache();
    return NextResponse.json({ ok: true, copied, folders });
  } catch (err) {
    if (err?.statusCode === 400) return badRequest(err.message);
    console.error('copy error:', err);
    return serverError('Failed to copy');
  }
}
