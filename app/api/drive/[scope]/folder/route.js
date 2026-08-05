import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { r2Client } from '@/lib/r2/client';
import {
  folderMarkerKey,
  normalizePrefix,
  safeSegment,
  ensureRootPrefixed,
  isReservedRelPath,
} from '@/lib/r2/keys';
import { deleteRecursive } from '@/lib/r2/listing';
import { trashFolder } from '@/lib/r2/trash';
import { invalidateUsageCache } from '@/lib/r2/usage';

export async function POST(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const { prefix = '', name } = body || {};
  const cleanName = safeSegment(name);
  if (!cleanName) return badRequest('Folder name required');

  const newRel = [normalizePrefix(prefix), cleanName].filter(Boolean).join('/');
  // ".trash" at the drive root is reserved for soft-deleted items.
  if (isReservedRelPath(newRel)) return badRequest('That folder name is reserved');

  const markerKey = folderMarkerKey(scope.rootPrefix, newRel);
  ensureRootPrefixed(markerKey, scope.rootPrefix);

  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: scope.bucket,
      Key: markerKey,
      Body: '',
      ContentType: 'application/x-directory',
    }));
    invalidateUsageCache();
    return NextResponse.json({ ok: true, prefix: newRel });
  } catch (err) {
    console.error('folder create error:', err);
    return serverError('Failed to create folder');
  }
}

export async function DELETE(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const { prefix } = body || {};
  const norm = normalizePrefix(prefix);
  if (!norm) return badRequest('Prefix required');
  if (isReservedRelPath(norm)) return badRequest('Use the trash view to manage deleted items');

  const permanent = body?.permanent === true;

  try {
    if (permanent) {
      const fullPrefix = `${scope.rootPrefix}/${norm}/`;
      ensureRootPrefixed(fullPrefix, scope.rootPrefix);
      const res = await deleteRecursive(scope.bucket, fullPrefix);
      invalidateUsageCache();
      return NextResponse.json({ ok: true, permanent: true, ...res });
    }

    const res = await trashFolder({ bucket: scope.bucket, rootPrefix: scope.rootPrefix, prefixRel: norm });
    invalidateUsageCache();
    return NextResponse.json({ ok: true, permanent: false, trashToken: res.token, deleted: res.count });
  } catch (err) {
    console.error('folder delete error:', err);
    return serverError('Failed to delete folder');
  }
}
