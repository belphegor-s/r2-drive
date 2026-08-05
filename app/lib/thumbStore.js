// Persistent thumbnail cache (IndexedDB).
//
// Rendering a PDF thumbnail costs a full download plus CPU, so the result has to
// survive reloads — otherwise every visit to a folder re-downloads every PDF and
// burns Class B operations for nothing.
//
// Entries are keyed by object key and validated against the object's size, which
// changes whenever the file is replaced. Keys carry a UUID, so a rename or move
// produces a new key and simply misses the cache.

const DB_NAME = 'r2drive-thumbs';
const STORE = 'thumbs';
const DB_VERSION = 1;
const MAX_ENTRIES = 400;
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  dbPromise ||= new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('at', 'at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private mode / blocked storage — callers treat null as "no cache".
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getThumb(key, size) {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    let req;
    try {
      req = tx(db, 'readonly').get(key);
    } catch {
      resolve(null);
      return;
    }
    req.onsuccess = () => {
      const row = req.result;
      if (!row) return resolve(null);
      // Same key but different byte length means the object was replaced.
      if (size != null && row.size != null && row.size !== size) return resolve(null);
      if (Date.now() - (row.at || 0) > MAX_AGE_MS) return resolve(null);
      resolve(row.dataUrl || null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function putThumb(key, size, dataUrl) {
  const db = await openDb();
  if (!db) return;

  try {
    tx(db, 'readwrite').put({ key, size, dataUrl, at: Date.now() });
  } catch {
    // quota or a closed connection — the thumbnail just won't persist
  }
}

/** Drop the oldest entries once the store grows past MAX_ENTRIES. */
export async function pruneThumbs() {
  const db = await openDb();
  if (!db) return;

  try {
    const store = tx(db, 'readwrite');
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - MAX_ENTRIES;
      if (excess <= 0) return;
      let removed = 0;
      const cursorReq = store.index('at').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || removed >= excess) return;
        cursor.delete();
        removed += 1;
        cursor.continue();
      };
    };
  } catch {
    // best effort
  }
}
