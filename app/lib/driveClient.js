// Client-side API wrappers for /api/drive/[scope]/*

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(body?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const base = (scope) => `/api/drive/${scope}`;

export const driveApi = {
  list: (scope, prefix = '') => {
    const u = new URL(`${base(scope)}/list`, window.location.origin);
    if (prefix) u.searchParams.set('prefix', prefix);
    return jsonFetch(u.toString());
  },
  tree: (scope, prefix = '') => {
    const u = new URL(`${base(scope)}/tree`, window.location.origin);
    if (prefix) u.searchParams.set('prefix', prefix);
    return jsonFetch(u.toString());
  },
  createFolder: (scope, prefix, name) =>
    jsonFetch(`${base(scope)}/folder`, { method: 'POST', body: JSON.stringify({ prefix, name }) }),
  deleteFolder: (scope, prefix, { permanent = false } = {}) =>
    jsonFetch(`${base(scope)}/folder`, { method: 'DELETE', body: JSON.stringify({ prefix, permanent }) }),
  deleteKeys: (scope, keys, { permanent = false } = {}) =>
    jsonFetch(`${base(scope)}/delete`, { method: 'POST', body: JSON.stringify({ keys, permanent }) }),
  // `keys` are file object keys, `prefixes` are folder paths relative to the scope root.
  move: (scope, { keys = [], prefixes = [], destPrefix = '' }) =>
    jsonFetch(`${base(scope)}/move`, { method: 'POST', body: JSON.stringify({ keys, prefixes, destPrefix }) }),
  copy: (scope, { keys = [], prefixes = [], destPrefix = '' }) =>
    jsonFetch(`${base(scope)}/copy`, { method: 'POST', body: JSON.stringify({ keys, prefixes, destPrefix }) }),
  rename: (scope, payload) =>
    jsonFetch(`${base(scope)}/rename`, { method: 'POST', body: JSON.stringify(payload) }),
  recent: (scope, { refresh = false } = {}) => {
    const u = new URL(`${base(scope)}/recent`, window.location.origin);
    if (refresh) u.searchParams.set('refresh', '1');
    return jsonFetch(u.toString());
  },
  meta: (scope, key) => {
    const u = new URL(`${base(scope)}/meta`, window.location.origin);
    u.searchParams.set('key', key);
    return jsonFetch(u.toString());
  },
  usage: ({ refresh = false } = {}) => {
    const u = new URL('/api/drive/usage', window.location.origin);
    if (refresh) u.searchParams.set('refresh', '1');
    return jsonFetch(u.toString());
  },
  trash: {
    list: (scope) => jsonFetch(`${base(scope)}/trash`),
    restore: (scope, token) =>
      jsonFetch(`${base(scope)}/trash`, { method: 'POST', body: JSON.stringify({ token }) }),
    purge: (scope, token) =>
      jsonFetch(`${base(scope)}/trash`, { method: 'DELETE', body: JSON.stringify({ token }) }),
    empty: (scope) =>
      jsonFetch(`${base(scope)}/trash`, { method: 'DELETE', body: JSON.stringify({ all: true }) }),
  },
  search: (scope, q, prefix = '') => {
    const u = new URL(`${base(scope)}/search`, window.location.origin);
    u.searchParams.set('q', q);
    if (prefix) u.searchParams.set('prefix', prefix);
    return jsonFetch(u.toString());
  },
  previewUrl: (scope, key) => {
    const u = new URL(`${base(scope)}/preview-url`, window.location.origin);
    u.searchParams.set('key', key);
    return jsonFetch(u.toString());
  },
  zipUrl: (scope) => `${base(scope)}/zip`,
};

// Downloads a single file with streaming progress. Strategy:
// 1. Fetch metadata + presigned URL from server (lightweight, no file data)
// 2. Stream directly from R2/CDN — fastest path, requires CORS on the bucket
// 3. On CORS/network error, fall back to server proxy — still has progress
//    because total is known from step 1
export async function downloadFileWithProgress(scope, key, filename, { signal, onProgress } = {}) {
  // Step 1: get direct URL + size from server (no file bytes flow through server here)
  const metaUrl = new URL(`/api/drive/${scope}/download-url`, window.location.origin);
  metaUrl.searchParams.set('key', key);
  const metaRes = await fetch(metaUrl.toString(), { signal, cache: 'no-store' });
  if (!metaRes.ok) {
    let msg = `Download failed (${metaRes.status})`;
    try { const j = await metaRes.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const { url: directUrl, contentLength, contentType } = await metaRes.json();
  const total = contentLength || 0;

  // Step 2: stream chunks from fetchUrl, reporting progress
  const streamFrom = async (fetchUrl) => {
    const res = await fetch(fetchUrl, { signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Streaming not supported in this browser');
    const chunks = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          if (onProgress) {
            onProgress({
              loaded: received,
              total,
              percent: total ? Math.min(100, (received / total) * 100) : null,
            });
          }
        }
      }
    } catch (err) {
      try { await reader.cancel(); } catch {}
      throw err;
    }
    return { chunks, received };
  };

  let result;
  try {
    // Try direct from R2/CDN (fast — no server hop for file data)
    result = await streamFrom(directUrl);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // CORS not configured or transient error — fall back to server proxy.
    // total is already known so progress bar stays accurate.
    const proxyUrl = new URL(`/api/drive/${scope}/download`, window.location.origin);
    proxyUrl.searchParams.set('key', key);
    result = await streamFrom(proxyUrl.toString());
  }

  const blob = new Blob(result.chunks, { type: contentType || 'application/octet-stream' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  return { bytes: result.received };
}

// Streams the zip response into memory, reporting progress, then triggers a
// browser save via blob URL. Supports cancel via AbortSignal.
//
// Note: the server streams the zip without a Content-Length, so total size is
// unknown until completion. Progress is reported in received bytes; the UI
// renders an indeterminate bar in that case.
export async function downloadZipWithProgress(scope, payload, filename = 'download.zip', { signal, onProgress } = {}) {
  const body = { ...(payload || {}), filename };
  const res = await fetch(`/api/drive/${scope}/zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });

  if (!res.ok) {
    let msg = `Zip failed (${res.status})`;
    try {
      const text = await res.text();
      if (text) msg = text.slice(0, 300);
    } catch {}
    throw new Error(msg);
  }

  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : 0;

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming not supported in this browser');

  const chunks = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (onProgress) {
          onProgress({
            loaded: received,
            total,
            percent: total ? Math.min(100, (received / total) * 100) : null,
          });
        }
      }
    }
  } catch (err) {
    try { await reader.cancel(); } catch {}
    throw err;
  }

  const blob = new Blob(chunks, { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { bytes: received };
}
