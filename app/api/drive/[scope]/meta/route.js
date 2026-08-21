import { NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { r2Client } from '@/lib/r2/client';
import { ensureRootPrefixed, basenameFromKey, folderPathFromKey, isTrashKey } from '@/lib/r2/keys';
import { mimeFromName, mimeCategory } from '@/lib/r2/mime';

export const dynamic = 'force-dynamic';

// On-demand object metadata for the details panel. One Class B operation.
export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  const key = new URL(req.url).searchParams.get('key');
  if (!key) return badRequest('key required');

  try {
    ensureRootPrefixed(key, scope.rootPrefix);
    if (isTrashKey(key, scope.rootPrefix)) return badRequest('Reserved path');
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: scope.bucket, Key: key }));
    const name = basenameFromKey(key);
    const mime = head.ContentType || mimeFromName(name);

    return NextResponse.json({
      key,
      name,
      folder: folderPathFromKey(key, scope.rootPrefix),
      size: head.ContentLength ?? 0,
      lastModified: head.LastModified ?? null,
      mime,
      category: mimeCategory(mime, name),
      etag: head.ETag ? head.ETag.replace(/"/g, '') : null,
      storageClass: head.StorageClass || 'Standard',
      cacheControl: head.CacheControl || null,
      url: scope.publicBase ? `${scope.publicBase}/${key}` : null,
    });
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err?.statusCode === 400) return badRequest(err.message);
    console.error('meta error:', err);
    return serverError('Failed to read metadata');
  }
}
