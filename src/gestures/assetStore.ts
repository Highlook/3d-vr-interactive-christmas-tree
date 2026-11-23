/**
 * 手势资源的本地持久缓存（IndexedDB）。
 * 首次下载 8 MB 后写进来，之后每次打开都直接读本地，不再依赖网络。
 * 任何异常都静默降级为「不缓存」，不阻塞识别功能。
 */
const DB_NAME = "xm-hand-assets";
const STORE = "files";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function readAsset(key: string): Promise<Uint8Array | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as unknown;
        if (value instanceof Uint8Array) resolve(value);
        else if (value instanceof ArrayBuffer) resolve(new Uint8Array(value));
        else resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeAsset(key: string, bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(bytes, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
