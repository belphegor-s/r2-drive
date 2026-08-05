import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from './client';
import { iterateAllObjects } from './listing';
import { basenameFromKey, isFolderMarker, normalizePrefix, UUID_RE } from './keys';

async function exists(bucket, key) {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    throw err;
  }
}

function withCopySuffix(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return `${filename} (copy)`;
  return `${filename.slice(0, dot)} (copy)${filename.slice(dot)}`;
}

async function uniqueDestKey(bucket, baseKey) {
  if (!(await exists(bucket, baseKey))) return baseKey;
  // baseKey: "<root>/<folders>/<uuid>-<filename>"
  const slashIdx = baseKey.lastIndexOf('/');
  const dir = baseKey.slice(0, slashIdx + 1);
  const last = baseKey.slice(slashIdx + 1);
  // Preserve uuid prefix; only modify the readable filename
  const dashIdx = last.indexOf('-');
  const uuid = dashIdx > 0 ? last.slice(0, dashIdx + 1) : '';
  const fname = dashIdx > 0 ? last.slice(dashIdx + 1) : last;
  for (let i = 1; i < 50; i++) {
    let candidate;
    if (i === 1) candidate = `${dir}${uuid}${withCopySuffix(fname)}`;
    else {
      const dot = fname.lastIndexOf('.');
      const stem = dot > 0 ? fname.slice(0, dot) : fname;
      const ext = dot > 0 ? fname.slice(dot) : '';
      candidate = `${dir}${uuid}${stem} (copy ${i})${ext}`;
    }
    if (!(await exists(bucket, candidate))) return candidate;
  }
  return `${dir}${Date.now()}-${last}`;
}

function destKeyFor(srcKey, srcRoot, srcRel, destRoot, destRel) {
  // Strip srcRoot/srcRel prefix from srcKey, append to destRoot/destRel
  const fromRoot = `${srcRoot}/`;
  const inside = srcKey.startsWith(fromRoot) ? srcKey.slice(fromRoot.length) : srcKey;
  const srcRelNorm = normalizePrefix(srcRel);
  const relFromBase = srcRelNorm && inside.startsWith(`${srcRelNorm}/`)
    ? inside.slice(srcRelNorm.length + 1)
    : inside;
  const destRelNorm = normalizePrefix(destRel);
  const destBase = destRelNorm ? `${destRoot}/${destRelNorm}/` : `${destRoot}/`;
  return `${destBase}${relFromBase}`;
}

async function chunkedRun(items, concurrency, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency).map(fn);
    out.push(...(await Promise.all(batch)));
  }
  return out;
}

export async function copyKeys({ bucket, keys, destRel, scopeRoot, ensureUnique = true }) {
  const ops = keys.map((srcKey) => async () => {
    if (isFolderMarker(srcKey)) return null;
    const fname = basenameFromKey(srcKey);
    const slashIdx = srcKey.lastIndexOf('/');
    const last = srcKey.slice(slashIdx + 1);
    const destFolder = normalizePrefix(destRel);
    const destBase = destFolder ? `${scopeRoot}/${destFolder}/` : `${scopeRoot}/`;
    let destKey = `${destBase}${last}`;
    if (ensureUnique) destKey = await uniqueDestKey(bucket, destKey);

    if (destKey === srcKey) return { srcKey, destKey, skipped: true };
    await r2Client.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: destKey,
      CopySource: `/${bucket}/${encodeURIComponent(srcKey).replace(/%2F/g, '/')}`,
    }));
    return { srcKey, destKey, name: fname };
  });
  return chunkedRun(ops, 5, (op) => op());
}

export async function moveKeys({ bucket, keys, destRel, scopeRoot }) {
  const copied = await copyKeys({ bucket, keys, destRel, scopeRoot, ensureUnique: false });
  const toDelete = copied.filter((c) => c && !c.skipped);
  await chunkedRun(
    toDelete,
    5,
    (c) => r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: c.srcKey })),
  );
  return copied;
}

// Recursive copy for a folder prefix. srcPrefixRel and destPrefixRel are relative to scopeRoot.
export async function copyFolder({ bucket, srcPrefixRel, destPrefixRel, scopeRoot }) {
  const srcAbs = `${scopeRoot}/${normalizePrefix(srcPrefixRel)}/`;
  const ops = [];
  for await (const obj of iterateAllObjects(bucket, srcAbs)) {
    const inside = obj.Key.slice(srcAbs.length);
    const destAbs = `${scopeRoot}/${normalizePrefix(destPrefixRel)}/${inside}`;
    ops.push(async () =>
      r2Client.send(new CopyObjectCommand({
        Bucket: bucket,
        Key: destAbs,
        CopySource: `/${bucket}/${encodeURIComponent(obj.Key).replace(/%2F/g, '/')}`,
      })),
    );
  }
  await chunkedRun(ops, 5, (op) => op());
}

// Would moving `srcRel` into `destParentRel` place the folder inside itself?
function isSelfOrDescendant(srcRel, destParentRel) {
  const src = normalizePrefix(srcRel);
  const dest = normalizePrefix(destParentRel);
  return dest === src || dest.startsWith(`${src}/`);
}

async function uniqueFolderRel(bucket, scopeRoot, destRel) {
  // One object is enough to prove the folder exists; the iterator stops there.
  const hasAny = async (rel) => {
    for await (const obj of iterateAllObjects(bucket, `${scopeRoot}/${rel}/`)) {
      if (obj) return true;
    }
    return false;
  };
  if (!(await hasAny(destRel))) return destRel;
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? `${destRel} (copy)` : `${destRel} (copy ${i})`;
    if (!(await hasAny(candidate))) return candidate;
  }
  return `${destRel} ${Date.now()}`;
}

/**
 * Move a folder subtree to a new parent. R2 has no server-side rename, so this
 * is copy-then-delete; the copies are pooled and the delete is batched.
 */
export async function moveFolder({ bucket, scopeRoot, srcPrefixRel, destParentRel = '' }) {
  const src = normalizePrefix(srcPrefixRel);
  if (!src) throw Object.assign(new Error('Source folder required'), { statusCode: 400 });

  if (isSelfOrDescendant(src, destParentRel)) {
    throw Object.assign(new Error('Cannot move a folder into itself'), { statusCode: 400 });
  }

  const name = src.split('/').pop();
  const destParent = normalizePrefix(destParentRel);
  const destRel = destParent ? `${destParent}/${name}` : name;

  if (destRel === src) return { from: src, to: src, skipped: true };

  await copyFolder({ bucket, srcPrefixRel: src, destPrefixRel: destRel, scopeRoot });
  const { deleteRecursive } = await import('./listing');
  await deleteRecursive(bucket, `${scopeRoot}/${src}/`);
  return { from: src, to: destRel };
}

/**
 * Copy a folder subtree under a new parent, picking a "(copy)" name if the
 * destination is already taken.
 */
export async function copyFolderInto({ bucket, scopeRoot, srcPrefixRel, destParentRel = '' }) {
  const src = normalizePrefix(srcPrefixRel);
  if (!src) throw Object.assign(new Error('Source folder required'), { statusCode: 400 });

  if (isSelfOrDescendant(src, destParentRel)) {
    throw Object.assign(new Error('Cannot copy a folder into itself'), { statusCode: 400 });
  }

  const name = src.split('/').pop();
  const destParent = normalizePrefix(destParentRel);
  const baseRel = destParent ? `${destParent}/${name}` : name;
  const destRel = await uniqueFolderRel(bucket, scopeRoot, baseRel);

  await copyFolder({ bucket, srcPrefixRel: src, destPrefixRel: destRel, scopeRoot });
  return { from: src, to: destRel };
}

export async function renameKey({ bucket, scopeRoot, key, newName }) {
  if (!key.startsWith(`${scopeRoot}/`)) throw new Error('Key escapes root');
  const slashIdx = key.lastIndexOf('/');
  const dir = key.slice(0, slashIdx + 1);
  const last = key.slice(slashIdx + 1);
  const uuidMatch = last.match(UUID_RE);
  const uuid = uuidMatch ? uuidMatch[0] : '';
  const newKey = `${dir}${uuid}${newName}`;
  if (newKey === key) return { key, newKey };
  await r2Client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: newKey,
    CopySource: `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
  }));
  await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { key, newKey };
}

export async function renameFolder({ bucket, scopeRoot, prefixRel, newName }) {
  const norm = normalizePrefix(prefixRel);
  const parts = norm.split('/').filter(Boolean);
  parts.pop();
  parts.push(normalizePrefix(newName));
  const destRel = parts.join('/');
  await copyFolder({ bucket, srcPrefixRel: norm, destPrefixRel: destRel, scopeRoot });
  // delete old
  const { deleteRecursive } = await import('./listing');
  await deleteRecursive(bucket, `${scopeRoot}/${norm}/`);
  return { from: norm, to: destRel };
}
