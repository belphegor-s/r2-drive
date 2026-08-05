import { NextResponse } from 'next/server';
import { requireAuthAndScope, serverError } from '@/lib/r2/guard';
import { iterateAllObjects } from '@/lib/r2/listing';
import { listingPrefix, basenameFromKey, isFolderMarker, folderPathFromKey, isTrashKey } from '@/lib/r2/keys';
import { mimeFromName, mimeCategory } from '@/lib/r2/mime';

const MAX_RESULTS = 500;

export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').toLowerCase().trim();
  const prefix = url.searchParams.get('prefix') || '';
  if (!q) return NextResponse.json({ q: '', results: [], truncated: false });

  try {
    const results = [];
    let truncated = false;
    for await (const obj of iterateAllObjects(scope.bucket, listingPrefix(scope.rootPrefix, prefix))) {
      if (isFolderMarker(obj.Key)) continue;
      if (isTrashKey(obj.Key, scope.rootPrefix)) continue;
      const name = basenameFromKey(obj.Key);
      if (!name.toLowerCase().includes(q)) continue;
      const mime = mimeFromName(name);
      results.push({
        key: obj.Key,
        name,
        size: obj.Size,
        lastModified: obj.LastModified,
        mime,
        category: mimeCategory(mime, name),
        folder: folderPathFromKey(obj.Key, scope.rootPrefix),
        url: scope.publicBase ? `${scope.publicBase}/${obj.Key}` : null,
      });
      if (results.length >= MAX_RESULTS) { truncated = true; break; }
    }
    return NextResponse.json({ q, prefix, results, truncated });
  } catch (err) {
    console.error('search error:', err);
    return serverError('Search failed');
  }
}
