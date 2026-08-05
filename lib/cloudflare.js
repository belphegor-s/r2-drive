// Optional Cloudflare API client.
//
// Used to read *authoritative* R2 billing numbers (storage bytes as Cloudflare
// meters them, plus Class A/B operation counts for the month). Everything here
// is best-effort: when the token is missing or under-scoped, callers fall back
// to counting objects over the S3 API instead.
//
// Token resolution order:
//   1. process.env.CF_API_TOKEN  (production — set this in Vercel)
//   2. ./.cf_token               (local dev convenience; gitignored)
//
// Required token permissions for the calls below:
//   - Account › Workers R2 Storage › Read
//   - Account › Account Analytics › Read
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';
const GRAPHQL = `${API}/graphql`;

let _tokenCache;

export function getCfToken() {
  if (_tokenCache !== undefined) return _tokenCache;

  const fromEnv = process.env.CF_API_TOKEN?.trim();
  if (fromEnv) {
    _tokenCache = fromEnv;
    return _tokenCache;
  }

  // Dev-only fallback. The file is gitignored and never ships to production,
  // so a miss here is normal and must stay silent.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const raw = readFileSync(join(process.cwd(), '.cf_token'), 'utf8').trim();
      if (raw) {
        _tokenCache = raw;
        return _tokenCache;
      }
    } catch {
      // no local token file — fine
    }
  }

  _tokenCache = null;
  return _tokenCache;
}

export function hasCfToken() {
  return Boolean(getCfToken());
}

async function cfFetch(url, init = {}) {
  const token = getCfToken();
  if (!token) throw new Error('No Cloudflare API token configured');

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    const msg = body?.errors?.[0]?.message || `Cloudflare API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function cfGraphql(query, variables) {
  const token = getCfToken();
  if (!token) throw new Error('No Cloudflare API token configured');

  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const body = await res.json().catch(() => null);
  if (body?.errors?.length) {
    const err = new Error(body.errors[0]?.message || 'GraphQL error');
    err.graphql = body.errors;
    throw err;
  }
  if (!res.ok) throw new Error(`Cloudflare GraphQL error (${res.status})`);
  return body?.data;
}

export async function verifyToken() {
  const body = await cfFetch(`${API}/user/tokens/verify`);
  return body.result;
}

export async function listZones() {
  const body = await cfFetch(`${API}/zones?per_page=50`);
  return (body.result || []).map((z) => ({
    id: z.id,
    name: z.name,
    status: z.status,
    plan: z.plan?.name,
  }));
}

const STORAGE_QUERY = `
  query R2Storage($accountTag: String!, $since: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        r2StorageAdaptiveGroups(
          limit: 100
          filter: { datetime_geq: $since }
          orderBy: [datetime_DESC]
        ) {
          max { objectCount payloadSize metadataSize }
          dimensions { bucketName datetime }
        }
      }
    }
  }
`;

// Latest metered storage per bucket, as Cloudflare bills it (payload + metadata).
export async function fetchR2Storage(accountTag) {
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const data = await cfGraphql(STORAGE_QUERY, { accountTag, since });
  const groups = data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups || [];

  // orderBy datetime_DESC → first row per bucket is the freshest sample.
  const byBucket = {};
  for (const g of groups) {
    const name = g.dimensions?.bucketName;
    if (!name || byBucket[name]) continue;
    byBucket[name] = {
      objects: g.max?.objectCount ?? 0,
      payloadBytes: g.max?.payloadSize ?? 0,
      metadataBytes: g.max?.metadataSize ?? 0,
      bytes: (g.max?.payloadSize ?? 0) + (g.max?.metadataSize ?? 0),
      sampledAt: g.dimensions?.datetime || null,
    };
  }
  return byBucket;
}

const OPS_QUERY = `
  query R2Ops($accountTag: String!, $since: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        r2OperationsAdaptiveGroups(
          limit: 500
          filter: { datetime_geq: $since }
        ) {
          sum { requests }
          dimensions { actionType bucketName }
        }
      }
    }
  }
`;

// Class A = mutating/listing calls, Class B = reads. Cloudflare bills them
// separately on the free tier (1M / 10M per month).
const CLASS_A_ACTIONS = new Set([
  'ListBuckets', 'PutBucket', 'ListObjects', 'PutObject', 'CopyObject', 'CompleteMultipartUpload',
  'CreateMultipartUpload', 'UploadPart', 'UploadPartCopy', 'ListMultipartUploads', 'ListParts',
  'PutBucketEncryption', 'PutBucketCors', 'PutBucketLifecycleConfiguration', 'LifecycleStorageTierTransition',
]);

export async function fetchR2Operations(accountTag, since) {
  const data = await cfGraphql(OPS_QUERY, { accountTag, since: since.toISOString() });
  const groups = data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups || [];

  let classA = 0;
  let classB = 0;
  const byBucket = {};

  for (const g of groups) {
    const action = g.dimensions?.actionType;
    const bucket = g.dimensions?.bucketName || 'unknown';
    const requests = g.sum?.requests ?? 0;
    const isA = CLASS_A_ACTIONS.has(action);

    if (isA) classA += requests;
    else classB += requests;

    byBucket[bucket] ||= { classA: 0, classB: 0 };
    byBucket[bucket][isA ? 'classA' : 'classB'] += requests;
  }

  return { classA, classB, byBucket };
}
