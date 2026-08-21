// Deep links. A drive URL fully describes what is on screen: `path` is the open
// folder, `preview` is the file open in the viewer. Both are relative to the
// scope root, so a link is short, readable, and cannot address anything outside
// its scope — the root prefix is re-attached here, never taken from the URL.
//
// Mirrors `rootPrefix` in lib/r2/scope.js, which is server-only.

export const SCOPE_ROOT = { public: 'uploads', private: 'private' };

// Kept in sync with TRASH_SEGMENT in lib/r2/keys.js — trashed objects have
// their own view and are never addressable by a drive link.
const RESERVED_SEGMENT = '.trash';

export function scopeRoot(scope) {
  return SCOPE_ROOT[scope] || '';
}

export function cleanRelPath(rel) {
  if (!rel) return '';
  return String(rel)
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/');
}

export function isReservedRel(rel) {
  return cleanRelPath(rel).split('/')[0] === RESERVED_SEGMENT;
}

export function relPathFromKey(scope, key) {
  if (!key) return '';
  const root = `${scopeRoot(scope)}/`;
  return key.startsWith(root) ? key.slice(root.length) : key;
}

export function keyFromRelPath(scope, rel) {
  const clean = cleanRelPath(rel);
  if (!clean || isReservedRel(clean)) return '';
  const root = scopeRoot(scope);
  return root ? `${root}/${clean}` : '';
}

export function folderOfRelPath(rel) {
  const parts = cleanRelPath(rel).split('/');
  parts.pop();
  return parts.join('/');
}

export function drivePath(scope, { path = '', preview = '' } = {}) {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (preview) params.set('preview', preview);
  const qs = params.toString();
  return `/upload/${scope}${qs ? `?${qs}` : ''}`;
}

export function driveUrl(scope, opts) {
  const rel = drivePath(scope, opts);
  if (typeof window === 'undefined') return rel;
  return new URL(rel, window.location.origin).toString();
}

// The link that reopens a given file exactly where it lives.
export function fileLink(scope, key) {
  const rel = relPathFromKey(scope, key);
  if (!rel) return '';
  return driveUrl(scope, { path: folderOfRelPath(rel), preview: rel });
}
