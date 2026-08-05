// Walk DataTransferItem entries (folder drag-drop) into a flat list of {file, relativePath}.
// Uses a fully-awaited recursive walk so deeply-nested directories are not lost.

function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const drained = [];
    const pump = () => {
      reader.readEntries(
        (entries) => {
          if (!entries.length) {
            resolve(drained);
          } else {
            drained.push(...entries);
            pump();
          }
        },
        (err) => reject(err),
      );
    };
    pump();
  });
}

function entryToFile(fileEntry) {
  return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
}

async function walkEntry(entry, basePath, out) {
  if (!entry) return;
  if (entry.isFile) {
    const file = await entryToFile(entry);
    out.push({ file, relativePath: basePath + file.name });
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const children = await readAllEntries(reader);
    const nextBase = basePath + entry.name + '/';
    for (const child of children) {
      await walkEntry(child, nextBase, out);
    }
  }
}

// IMPORTANT: call this from inside the drop handler synchronously up to the
// point of grabbing entries — the DataTransferItemList is invalidated after
// the dispatch returns, so any later access yields nulls.
export function snapshotDataTransferEntries(items) {
  const entries = [];
  const looseFiles = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) looseFiles.push(file);
    }
  }
  return { entries, looseFiles };
}

export async function readDataTransferItems(items) {
  const { entries, looseFiles } = snapshotDataTransferEntries(items);
  const out = looseFiles.map((file) => ({ file, relativePath: file.name }));
  await Promise.all(entries.map((entry) => walkEntry(entry, '', out)));
  return out;
}

// Two-phase variant for callers that already grabbed the snapshot synchronously.
export async function walkSnapshot({ entries, looseFiles }) {
  const out = looseFiles.map((file) => ({ file, relativePath: file.name }));
  await Promise.all(entries.map((entry) => walkEntry(entry, '', out)));
  return out;
}

// Convert <input webkitdirectory> FileList to {file, relativePath} array.
export function fileListToEntries(fileList) {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

// Upload entries using presigned URLs.
// 1. Get presigned URLs for all files.
// 2. Upload files in parallel with a concurrency limit.
// 3. Track aggregate progress.
export async function uploadEntries({ scope, prefix, entries, onProgress, onFileDone, signal }) {
  if (!entries.length) return;

  // Step 1: Get presigned URLs
  const presignResp = await fetch(`/api/drive/${scope}/upload/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix,
      files: entries.map((e) => ({
        filename: e.file.name,
        size: e.file.size,
        relativePath: e.relativePath,
        mimeType: e.file.type || 'application/octet-stream',
      })),
    }),
    signal,
  });

  if (!presignResp.ok) {
    const err = await presignResp.json();
    throw new Error(err.error || 'Failed to get presigned URLs');
  }

  const { files: presignedFiles } = await presignResp.json();

  // Step 2: Upload files
  const totalSize = entries.reduce((acc, e) => acc + e.file.size, 0);
  const fileProgress = new Map(); // key -> loaded bytes
  presignedFiles.forEach((f) => fileProgress.set(f.key, 0));

  const uploadFile = (file, url, key) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      // Ensure Content-Type matches what was signed. 
      // If file.type is empty, we signed it as 'application/octet-stream' in the backend,
      // but the SDK getSignedUrl default might differ. 
      // Let's force it to match our backend logic.
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      const onAbort = () => {
        try {
          xhr.abort();
        } catch {}
        const err = new Error('Upload cancelled');
        err.name = 'AbortError';
        reject(err);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          fileProgress.set(key, ev.loaded);
          const totalLoaded = Array.from(fileProgress.values()).reduce((a, b) => a + b, 0);
          if (onProgress) {
            onProgress({
              loaded: totalLoaded,
              total: totalSize,
              percent: (totalLoaded / totalSize) * 100,
            });
          }
        }
      };

      xhr.onload = () => {
        signal?.removeEventListener?.('abort', onAbort);
        if (xhr.status >= 200 && xhr.status < 300) {
          fileProgress.set(key, file.size); // Ensure it's marked as fully loaded
          if (onFileDone) onFileDone({ key, name: file.name, size: file.size });
          resolve();
        } else {
          reject(new Error(`Upload failed for ${file.name}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        signal?.removeEventListener?.('abort', onAbort);
        reject(new Error(`Network error uploading ${file.name}`));
      };

      xhr.onabort = () => {
        signal?.removeEventListener?.('abort', onAbort);
        const err = new Error('Upload cancelled');
        err.name = 'AbortError';
        reject(err);
      };

      xhr.send(file);
    });
  };

  // Concurrency control
  const CONCURRENCY = 3;
  const queue = [...presignedFiles.map((pf, i) => ({ ...pf, file: entries[i].file }))];
  const results = [];
  const workers = Array(Math.min(CONCURRENCY, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await uploadFile(item.file, item.url, item.key);
        results.push({ key: item.key, name: item.filename, size: item.file.size });
      }
    });


  await Promise.all(workers);
  return { message: 'Upload complete', files: results };
}
