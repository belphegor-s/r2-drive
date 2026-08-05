// Key/path helpers. Keys in R2 = "<rootPrefix>/<folderPath>/<uuid>-<filename>"
// All "prefix" args here are the user-facing relative folder path (no rootPrefix, no leading/trailing slash).

export const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-/i;
const CONTROL_RE = /[\x00-\x1f\x7f]+/g;

export function safeSegment(seg) {
  if (typeof seg !== 'string') return '';
  return seg
    .replace(/[\\/]+/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(CONTROL_RE, '')
    .trim();
}

export function normalizePrefix(prefix) {
  if (!prefix) return '';
  return String(prefix)
    .split('/')
    .map((s) => safeSegment(s))
    .filter(Boolean)
    .join('/');
}

export function joinKey(...parts) {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map(String)
    .join('/')
    .replace(/\/+/g, '/');
}

export function withScopeRoot(rootPrefix, relPath = '') {
  const norm = normalizePrefix(relPath);
  return norm ? `${rootPrefix}/${norm}` : `${rootPrefix}`;
}

export function listingPrefix(rootPrefix, relPath = '') {
  // Trailing slash for ListObjectsV2 with Delimiter
  return `${withScopeRoot(rootPrefix, relPath)}/`;
}

export function parentPrefix(relPath = '') {
  const parts = normalizePrefix(relPath).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function basenameFromKey(key) {
  if (!key) return '';
  const last = key.split('/').pop() || '';
  return last.replace(UUID_RE, '');
}

export function relativePathFromKey(key, rootPrefix) {
  if (!key) return '';
  const root = `${rootPrefix}/`;
  const trimmed = key.startsWith(root) ? key.slice(root.length) : key;
  return trimmed;
}

export function folderPathFromKey(key, rootPrefix) {
  const rel = relativePathFromKey(key, rootPrefix);
  const parts = rel.split('/');
  parts.pop();
  return parts.join('/');
}

export function isInsideRoot(key, rootPrefix) {
  if (typeof key !== 'string') return false;
  return key === rootPrefix || key.startsWith(`${rootPrefix}/`);
}

export function folderMarkerKey(rootPrefix, relPath) {
  return `${withScopeRoot(rootPrefix, relPath)}/.keep`;
}

export function isFolderMarker(key) {
  return typeof key === 'string' && key.endsWith('/.keep');
}

// ─── Trash ───────────────────────────────────────────────────────────────────
// Deleted items are moved to "<rootPrefix>/.trash/<token>/<originalRelPath>"
// rather than removed. Because the original path is preserved verbatim under the
// token, restore needs no sidecar database — see lib/r2/trash.js.
export const TRASH_SEGMENT = '.trash';

export function trashRoot(rootPrefix) {
  return `${rootPrefix}/${TRASH_SEGMENT}/`;
}

export function isTrashKey(key, rootPrefix) {
  return typeof key === 'string' && key.startsWith(trashRoot(rootPrefix));
}

// A relative path the user should never see or address directly.
export function isReservedRelPath(relPath = '') {
  const first = normalizePrefix(relPath).split('/')[0];
  return first === TRASH_SEGMENT;
}

export function ensureRootPrefixed(key, rootPrefix) {
  if (!isInsideRoot(key, rootPrefix)) {
    const err = new Error('Key escapes scope root');
    err.statusCode = 400;
    throw err;
  }
  return key;
}

export function commonPrefixToFolder(commonPrefix, rootPrefix) {
  // commonPrefix like "uploads/foo/bar/"
  const stripped = commonPrefix.replace(/\/$/, '');
  const root = `${rootPrefix}/`;
  const rel = stripped.startsWith(root) ? stripped.slice(root.length) : stripped;
  const name = rel.split('/').pop();
  return { name, prefix: rel };
}

export function uuidPrefixedFilename(filename) {
  const safe = safeSegment(filename || 'file');
  const id = globalThis.crypto?.randomUUID?.() || cryptoFallback();
  return `${id}-${safe}`;
}

function cryptoFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
