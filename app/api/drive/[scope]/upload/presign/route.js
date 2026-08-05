import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuthAndScope } from '@/lib/r2/guard';
import { r2Client } from '@/lib/r2/client';
import { normalizePrefix, uuidPrefixedFilename, safeSegment, ensureRootPrefixed, isReservedRelPath } from '@/lib/r2/keys';
import { invalidateUsageCache } from '@/lib/r2/usage';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  try {
    const { prefix, files } = await req.json();

    if (!Array.isArray(files)) {
      return NextResponse.json({ error: 'Files array is required' }, { status: 400 });
    }

    const cleanedBase = normalizePrefix(prefix);
    if (isReservedRelPath(cleanedBase)) {
      return NextResponse.json({ error: 'That location is reserved' }, { status: 400 });
    }

    const presignedData = await Promise.all(
      files.map(async (file) => {
        const { filename, relativePath, mimeType, size } = file;

        if (size > MAX_FILE_SIZE) {
          throw new Error(`File "${filename}" exceeds 100MB limit.`);
        }

        // Compute folder portion
        const relParts = (relativePath || '').split('/').filter(Boolean);
        relParts.pop(); // drop filename portion
        const subFolder = relParts.map(safeSegment).filter(Boolean).join('/');

        const folderRel = [cleanedBase, subFolder].filter(Boolean).join('/');
        const folderAbs = folderRel ? `${scope.rootPrefix}/${folderRel}` : scope.rootPrefix;
        const key = `${folderAbs}/${uuidPrefixedFilename(filename)}`;
        ensureRootPrefixed(key, scope.rootPrefix);

        const command = new PutObjectCommand({
          Bucket: scope.bucket,
          Key: key,
          ContentType: mimeType,
          // Explicitly disable flexible checksums in newer SDK versions
          ChecksumAlgorithm: undefined,
        });

        const url = await getSignedUrl(r2Client, command, {
          expiresIn: 3600,
          signableHeaders: new Set(['content-type']),
        });

        return {
          url,
          key,
          filename,
          relativePath,
          acl: scope.acl,
        };
      })
    );

    // Bytes land in R2 via the presigned PUTs, so the cached usage snapshot is
    // stale the moment these URLs are handed out.
    invalidateUsageCache();

    return NextResponse.json({ files: presignedData });
  } catch (err) {
    console.error('Presign error:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate presigned URLs' }, { status: 500 });
  }
}
