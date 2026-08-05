import { NextResponse } from 'next/server';
import { requireAuthAndScope, serverError } from '@/lib/r2/guard';
import { listOneLevel } from '@/lib/r2/listing';
import { listingPrefix, commonPrefixToFolder, isReservedRelPath } from '@/lib/r2/keys';

export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  const url = new URL(req.url);
  const prefix = url.searchParams.get('prefix') || '';

  try {
    const list = await listOneLevel(scope.bucket, listingPrefix(scope.rootPrefix, prefix));
    const folders = list.folders
      .map((cp) => commonPrefixToFolder(cp, scope.rootPrefix))
      .filter((f) => !isReservedRelPath(f.prefix));
    return NextResponse.json({ prefix, folders });
  } catch (err) {
    console.error('tree error:', err);
    return serverError('Failed to load tree');
  }
}
