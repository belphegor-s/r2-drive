// Storage accounting for the free-plan quota widget.
//
// Two independent sources, combined:
//
//   1. S3 LIST over each scope's root prefix — always available, gives the
//      per-folder / per-category breakdown the UI draws. Costs one Class A
//      operation per 1000 objects, so results are cached aggressively.
//   2. Cloudflare's GraphQL analytics — the numbers Cloudflare actually bills
//      (metadata included) plus month-to-date Class A/B operation counts.
//      Best-effort: requires an API token with R2 + Account Analytics read.
import { iterateAllObjects } from './listing';
import { SCOPES } from './scope';
import { basenameFromKey, isFolderMarker, isTrashKey, relativePathFromKey } from './keys';
import { mimeFromName, mimeCategory } from './mime';
import { hasCfToken, fetchR2Storage, fetchR2Operations } from '../cloudflare';

// Cloudflare R2 free tier, per month.
export const FREE_PLAN_LIMITS = {
  storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB-month
  classAOps: 1_000_000,
  classBOps: 10_000_000,
  egressBytes: null, // unmetered
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_GRACE_MS = 60 * 60 * 1000;

let cache = null; // { at: number, value: object }
let inFlight = null;

function emptyBucketStats() {
  return {
    bytes: 0,
    objects: 0,
    trashBytes: 0,
    trashObjects: 0,
    byCategory: {},
    topFolders: [],
    largestFiles: [],
    lastModified: null,
  };
}

function bump(map, key, bytes) {
  const cur = map[key] || { bytes: 0, count: 0 };
  cur.bytes += bytes;
  cur.count += 1;
  map[key] = cur;
}

async function scanScope(scopeName, cfg) {
  const stats = emptyBucketStats();
  if (!cfg?.bucket) return { ...stats, bucket: null, error: 'Bucket not configured' };

  const folderTotals = new Map();
  const largest = [];

  try {
    for await (const obj of iterateAllObjects(cfg.bucket, `${cfg.rootPrefix}/`)) {
      const size = obj.Size || 0;

      if (isTrashKey(obj.Key, cfg.rootPrefix)) {
        stats.trashBytes += size;
        if (!isFolderMarker(obj.Key)) stats.trashObjects += 1;
        continue;
      }
      if (isFolderMarker(obj.Key)) continue;

      stats.bytes += size;
      stats.objects += 1;

      const modified = obj.LastModified ? new Date(obj.LastModified).toISOString() : null;
      if (modified && (!stats.lastModified || modified > stats.lastModified)) stats.lastModified = modified;

      const name = basenameFromKey(obj.Key);
      bump(stats.byCategory, mimeCategory(mimeFromName(name), name), size);

      // Top-level folder attribution ("" = files sitting at the drive root).
      const rel = relativePathFromKey(obj.Key, cfg.rootPrefix);
      const top = rel.includes('/') ? rel.split('/')[0] : '';
      folderTotals.set(top, (folderTotals.get(top) || 0) + size);

      largest.push({ key: obj.Key, name, size, folder: rel.split('/').slice(0, -1).join('/') });
      if (largest.length > 4000) {
        largest.sort((a, b) => b.size - a.size);
        largest.length = 200;
      }
    }
  } catch (err) {
    console.error(`usage scan failed for scope "${scopeName}":`, err);
    return { ...stats, bucket: cfg.bucket, error: 'Scan failed' };
  }

  stats.topFolders = Array.from(folderTotals.entries())
    .map(([name, bytes]) => ({ name: name || '(root)', prefix: name, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);

  largest.sort((a, b) => b.size - a.size);
  stats.largestFiles = largest.slice(0, 10);

  return { ...stats, bucket: cfg.bucket, error: null };
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function fetchBilling(scopeStats) {
  if (!hasCfToken() || !process.env.R2_ACCOUNT_ID) {
    return { available: false, reason: 'no-token' };
  }

  const accountTag = process.env.R2_ACCOUNT_ID;
  const buckets = new Set(Object.values(scopeStats).map((s) => s.bucket).filter(Boolean));

  const [storage, ops] = await Promise.allSettled([
    fetchR2Storage(accountTag),
    fetchR2Operations(accountTag, monthStart()),
  ]);

  const out = { available: false, reason: null, storageBytes: null, objects: null, classA: null, classB: null, periodStart: monthStart().toISOString() };

  if (storage.status === 'fulfilled') {
    let bytes = 0;
    let objects = 0;
    let sawAny = false;
    for (const [name, s] of Object.entries(storage.value)) {
      if (!buckets.has(name)) continue;
      bytes += s.bytes;
      objects += s.objects;
      sawAny = true;
    }
    if (sawAny) {
      out.storageBytes = bytes;
      out.objects = objects;
      out.available = true;
    }
  } else {
    out.reason = 'unauthorized';
  }

  if (ops.status === 'fulfilled') {
    out.classA = ops.value.classA;
    out.classB = ops.value.classB;
    out.available = true;
  } else if (!out.reason) {
    out.reason = 'unauthorized';
  }

  return out;
}

async function computeFresh() {
  const scopeStats = {};
  const names = Object.keys(SCOPES);

  const results = await Promise.all(names.map((name) => scanScope(name, SCOPES[name])));
  names.forEach((name, i) => {
    scopeStats[name] = results[i];
  });

  const billing = await fetchBilling(scopeStats).catch(() => ({ available: false, reason: 'error' }));

  const totals = Object.values(scopeStats).reduce(
    (acc, s) => ({
      bytes: acc.bytes + s.bytes,
      objects: acc.objects + s.objects,
      trashBytes: acc.trashBytes + s.trashBytes,
      trashObjects: acc.trashObjects + s.trashObjects,
    }),
    { bytes: 0, objects: 0, trashBytes: 0, trashObjects: 0 },
  );

  // Cloudflare bills whatever is stored, trash included.
  const storedBytes = totals.bytes + totals.trashBytes;
  const billedBytes = billing.available && billing.storageBytes != null ? billing.storageBytes : storedBytes;

  return {
    computedAt: new Date().toISOString(),
    source: billing.available && billing.storageBytes != null ? 'cloudflare' : 's3',
    scopes: scopeStats,
    totals: { ...totals, storedBytes },
    billing,
    limits: FREE_PLAN_LIMITS,
    quota: {
      storage: {
        used: billedBytes,
        limit: FREE_PLAN_LIMITS.storageBytes,
        percent: Math.min(100, (billedBytes / FREE_PLAN_LIMITS.storageBytes) * 100),
      },
      classA: billing.classA == null ? null : {
        used: billing.classA,
        limit: FREE_PLAN_LIMITS.classAOps,
        percent: Math.min(100, (billing.classA / FREE_PLAN_LIMITS.classAOps) * 100),
      },
      classB: billing.classB == null ? null : {
        used: billing.classB,
        limit: FREE_PLAN_LIMITS.classBOps,
        percent: Math.min(100, (billing.classB / FREE_PLAN_LIMITS.classBOps) * 100),
      },
    },
  };
}

/**
 * Cached usage snapshot.
 *
 * Concurrent callers share one scan. Within TTL the cached value is returned
 * outright; past TTL but inside the stale window the stale value is served
 * immediately while a refresh runs in the background, so the sidebar never
 * blocks on a full bucket walk.
 */
export async function getUsage({ force = false } = {}) {
  const now = Date.now();

  if (!force && cache && now - cache.at < CACHE_TTL_MS) {
    return { ...cache.value, cached: true, stale: false };
  }

  const refresh = () => {
    inFlight ||= computeFresh()
      .then((value) => {
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  if (!force && cache && now - cache.at < STALE_GRACE_MS) {
    refresh().catch((err) => console.error('background usage refresh failed:', err));
    return { ...cache.value, cached: true, stale: true };
  }

  const value = await refresh();
  return { ...value, cached: false, stale: false };
}

export function invalidateUsageCache() {
  cache = null;
}
