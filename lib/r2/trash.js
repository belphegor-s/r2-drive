// Soft delete ("Trash") for the drive.
//
// Layout:  <rootPrefix>/.trash/<token>/<originalRelPathFromRoot>
//
// `token` is a base64url-encoded JSON blob carrying only *display* metadata
// (name, kind, deleted-at, original parent folder). Restore does not read it:
// the original path is preserved verbatim after the token, so restoring is a
// plain "strip the token segment" copy. That keeps the whole feature stateless —
// no database, no sidecar objects, and listing the trash costs a single
// paginated LIST.
import { CopyObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from './client';
import { iterateAllObjects, deleteKeysBatched } from './listing';
import {
  TRASH_SEGMENT,
  trashRoot,
  basenameFromKey,
  isFolderMarker,
  normalizePrefix,
  relativePathFromKey,
} from './keys';

const COPY_CONCURRENCY = 8;

function encodeToken(meta) {
  return Buffer.from(JSON.stringify(meta), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeToken(token) {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const meta = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!meta || typeof meta !== 'object') return null;
    return meta;
  } catch {
    return null;
  }
}

// Tokens are opaque path segments we generated ourselves. Reject anything that
// could traverse out of the trash root before it reaches a key.
function assertSafeToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9\-_]{1,512}$/.test(token)) {
    const err = new Error('Invalid trash token');
    err.statusCode = 400;
    throw err;
  }
  return token;
}

async function runPooled(items, concurrency, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency).map(fn);
    out.push(...(await Promise.all(batch)));
  }
  return out;
}

function copySource(bucket, key) {
  return `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
}

async function copyThenDelete(bucket, pairs) {
  await runPooled(pairs, COPY_CONCURRENCY, ({ from, to }) =>
    r2Client.send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: copySource(bucket, from) })),
  );
  await deleteKeysBatched(bucket, pairs.map((p) => p.from));
  return pairs.length;
}

/**
 * Move files into the trash. Each call produces one restorable trash entry.
 * @returns {Promise<{token: string, count: number}>}
 */
export async function trashKeys({ bucket, rootPrefix, keys }) {
  const real = keys.filter((k) => !isFolderMarker(k));
  if (real.length === 0) return { token: null, count: 0 };

  const first = real[0];
  const firstRel = relativePathFromKey(first, rootPrefix);
  const parent = firstRel.split('/').slice(0, -1).join('/');

  const token = encodeToken({
    t: Date.now(),
    k: 'file',
    n: real.length === 1 ? basenameFromKey(first) : `${real.length} files`,
    p: parent,
    c: real.length,
  });

  const base = `${trashRoot(rootPrefix)}${token}/`;
  const pairs = real.map((key) => ({ from: key, to: `${base}${relativePathFromKey(key, rootPrefix)}` }));

  const count = await copyThenDelete(bucket, pairs);
  return { token, count };
}

/**
 * Move a whole folder subtree into the trash as a single restorable entry.
 */
export async function trashFolder({ bucket, rootPrefix, prefixRel }) {
  const norm = normalizePrefix(prefixRel);
  if (!norm) {
    const err = new Error('Folder prefix required');
    err.statusCode = 400;
    throw err;
  }

  const srcAbs = `${rootPrefix}/${norm}/`;
  const keys = [];
  for await (const obj of iterateAllObjects(bucket, srcAbs)) keys.push(obj.Key);
  if (keys.length === 0) return { token: null, count: 0 };

  const segments = norm.split('/');
  const name = segments[segments.length - 1];

  const token = encodeToken({
    t: Date.now(),
    k: 'folder',
    n: name,
    p: segments.slice(0, -1).join('/'),
    c: keys.length,
  });

  const base = `${trashRoot(rootPrefix)}${token}/`;
  const pairs = keys.map((key) => ({ from: key, to: `${base}${relativePathFromKey(key, rootPrefix)}` }));

  const count = await copyThenDelete(bucket, pairs);
  return { token, count };
}

/**
 * List trash entries, newest first. One LIST over the trash prefix; entries are
 * grouped by their token segment in memory.
 */
export async function listTrash({ bucket, rootPrefix }) {
  const base = trashRoot(rootPrefix);
  const groups = new Map();

  for await (const obj of iterateAllObjects(bucket, base)) {
    const rest = obj.Key.slice(base.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) continue; // stray object directly under .trash/ — ignore

    const token = rest.slice(0, slash);
    let group = groups.get(token);
    if (!group) {
      const meta = decodeToken(token);
      if (!meta) continue; // unreadable token — hide rather than crash the view
      group = {
        token,
        name: meta.n || 'Untitled',
        kind: meta.k === 'folder' ? 'folder' : 'file',
        deletedAt: meta.t ? new Date(meta.t).toISOString() : null,
        originalFolder: meta.p || '',
        size: 0,
        objects: 0,
        sampleKeys: [],
      };
      groups.set(token, group);
    }

    group.size += obj.Size || 0;
    if (!isFolderMarker(obj.Key)) group.objects += 1;
    if (group.sampleKeys.length < 4) group.sampleKeys.push(obj.Key);
  }

  return Array.from(groups.values()).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

/**
 * Restore one trash entry back to its original location.
 * Existing objects at the destination are overwritten (the key carries a UUID,
 * so a genuine collision means the same object was restored twice).
 */
export async function restoreTrash({ bucket, rootPrefix, token }) {
  assertSafeToken(token);
  const base = `${trashRoot(rootPrefix)}${token}/`;

  const pairs = [];
  for await (const obj of iterateAllObjects(bucket, base)) {
    const rel = obj.Key.slice(base.length);
    if (!rel) continue;
    pairs.push({ from: obj.Key, to: `${rootPrefix}/${rel}` });
  }
  if (pairs.length === 0) {
    const err = new Error('Trash entry not found');
    err.statusCode = 404;
    throw err;
  }

  const meta = decodeToken(token) || {};
  const count = await copyThenDelete(bucket, pairs);
  return { count, restoredTo: meta.p || '', name: meta.n || '' };
}

/** Permanently delete one trash entry. */
export async function purgeTrashEntry({ bucket, rootPrefix, token }) {
  assertSafeToken(token);
  const base = `${trashRoot(rootPrefix)}${token}/`;
  const keys = [];
  for await (const obj of iterateAllObjects(bucket, base)) keys.push(obj.Key);
  return deleteKeysBatched(bucket, keys);
}

/** Permanently delete everything in the trash. */
export async function emptyTrash({ bucket, rootPrefix }) {
  const keys = [];
  for await (const obj of iterateAllObjects(bucket, trashRoot(rootPrefix))) keys.push(obj.Key);
  return deleteKeysBatched(bucket, keys);
}

/**
 * Drop trash entries older than `days`. Opt-in: callers pass 0 to disable.
 * Returns the number of entries removed.
 */
export async function purgeExpiredTrash({ bucket, rootPrefix, days }) {
  if (!days || days <= 0) return { purged: 0 };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const entries = await listTrash({ bucket, rootPrefix });
  const expired = entries.filter((e) => e.deletedAt && new Date(e.deletedAt).getTime() < cutoff);

  for (const entry of expired) {
    await purgeTrashEntry({ bucket, rootPrefix, token: entry.token });
  }
  return { purged: expired.length };
}

export { TRASH_SEGMENT };
