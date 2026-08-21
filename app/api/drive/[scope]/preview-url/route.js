import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuthAndScope, badRequest, serverError } from '@/lib/r2/guard';
import { r2Client } from '@/lib/r2/client';
import { ensureRootPrefixed, isTrashKey } from '@/lib/r2/keys';
import { sign } from '@/lib/sign-token';

const DOC_EXTS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp']);

function isDocFile(key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  return DOC_EXTS.has(ext);
}

function isLocalDev(hostname) {
  return hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.') || hostname === '[::1]';
}

export async function GET(req, { params }) {
  const { scope: scopeName } = await params;
  const { error, scope } = await requireAuthAndScope(req, scopeName);
  if (error) return error;

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return badRequest('key required');

  try {
    ensureRootPrefixed(key, scope.rootPrefix);
    if (isTrashKey(key, scope.rootPrefix)) return badRequest('Reserved path');

    if (isDocFile(key) && !isLocalDev(req.nextUrl.hostname)) {
      const expires = Math.floor(Date.now() / 1000) + 600;
      const payload = `${scopeName}:${key}:${expires}`;
      const sig = sign(payload);
      const proxyUrl = `${req.nextUrl.origin}/api/doc-proxy?scope=${encodeURIComponent(scopeName)}&key=${encodeURIComponent(key)}&exp=${expires}&sig=${encodeURIComponent(sig)}`;
      return NextResponse.json({ url: proxyUrl });
    }

    if (scope.publicBase) {
      return NextResponse.json({ url: `${scope.publicBase}/${key}` });
    }
    const signed = await getSignedUrl(
      r2Client,
      new GetObjectCommand({ Bucket: scope.bucket, Key: key }),
      { expiresIn: 300 },
    );
    return NextResponse.json({ url: signed });
  } catch (err) {
    console.error('preview-url error:', err);
    return serverError('Failed to sign');
  }
}
