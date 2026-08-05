import { NextResponse } from 'next/server';
import { requireAuthAndScope, serverError } from '@/lib/r2/guard';
import { listOneLevel } from '@/lib/r2/listing';
import { listingPrefix, basenameFromKey, commonPrefixToFolder, isFolderMarker, isReservedRelPath } from '@/lib/r2/keys';
import { mimeFromName, mimeCategory } from '@/lib/r2/mime';

export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  const url = new URL(req.url);
  const prefix = url.searchParams.get('prefix') || '';

  try {
    const list = await listOneLevel(scope.bucket, listingPrefix(scope.rootPrefix, prefix));

    // ".trash" is an implementation detail of soft delete — it has its own view.
    const folders = list.folders
      .map((cp) => commonPrefixToFolder(cp, scope.rootPrefix))
      .filter((f) => !isReservedRelPath(f.prefix));

    const files = list.files
      .filter((obj) => !isFolderMarker(obj.Key))
      .map((obj) => {
        const name = basenameFromKey(obj.Key);
        const mime = mimeFromName(name);
        return {
          key: obj.Key,
          name,
          size: obj.Size,
          lastModified: obj.LastModified,
          mime,
          category: mimeCategory(mime, name),
          url: scope.publicBase ? `${scope.publicBase}/${obj.Key}` : null,
        };
      });

    return NextResponse.json({ prefix, folders, files });
  } catch (err) {
    console.error('list error:', err);
    return serverError('Failed to list');
  }
}
