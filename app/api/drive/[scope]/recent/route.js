import { NextResponse } from 'next/server';
import { requireAuthAndScope, serverError } from '@/lib/r2/guard';
import { iterateAllObjects } from '@/lib/r2/listing';
import { listingPrefix, basenameFromKey, isFolderMarker, isTrashKey, folderPathFromKey } from '@/lib/r2/keys';
import { mimeFromName, mimeCategory } from '@/lib/r2/mime';

export const dynamic = 'force-dynamic';

const LIMIT = 60;
const TTL_MS = 3 * 60 * 1000;

// "Recent" needs a full LIST (R2 cannot sort by mtime), so results are cached
// per scope to keep Class A operations off the free-tier budget.
const cache = new Map(); // scopeName -> { at, files }

export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';

  const hit = cache.get(scopeName);
  if (!force && hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ files: hit.files, cached: true });
  }

  try {
    const files = [];
    for await (const obj of iterateAllObjects(scope.bucket, listingPrefix(scope.rootPrefix, ''))) {
      if (isFolderMarker(obj.Key) || isTrashKey(obj.Key, scope.rootPrefix)) continue;
      const name = basenameFromKey(obj.Key);
      const mime = mimeFromName(name);
      files.push({
        key: obj.Key,
        name,
        size: obj.Size,
        lastModified: obj.LastModified,
        mime,
        category: mimeCategory(mime, name),
        folder: folderPathFromKey(obj.Key, scope.rootPrefix),
        url: scope.publicBase ? `${scope.publicBase}/${obj.Key}` : null,
      });
    }

    files.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
    const top = files.slice(0, LIMIT);
    cache.set(scopeName, { at: Date.now(), files: top });

    return NextResponse.json({ files: top, cached: false });
  } catch (err) {
    console.error('recent error:', err);
    return serverError('Failed to load recent files');
  }
}
