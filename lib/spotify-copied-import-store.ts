const DATABASE_NAME = 'songs-for-self-copied-import';
const STORE_NAME = 'checkpoints';
const LATEST_KEY = 'latest';
const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
export const SPOTIFY_COPIED_IMPORT_SCHEMA_VERSION = 1;

export type StoredSpotifyCopiedImport = {
  version: typeof SPOTIFY_COPIED_IMPORT_SCHEMA_VERSION;
  trackIds: string[];
  rowsById: Record<string, Record<string, string>>;
  savedAt: number;
};

export function makeStoredSpotifyCopiedImport(trackIds: string[], rowsById: Record<string, Record<string, string>>, savedAt = Date.now()): StoredSpotifyCopiedImport {
  return { version: SPOTIFY_COPIED_IMPORT_SCHEMA_VERSION, trackIds, rowsById, savedAt };
}

export function isStoredSpotifyCopiedImport(value: unknown): value is StoredSpotifyCopiedImport {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredSpotifyCopiedImport>;
  if (candidate.version !== SPOTIFY_COPIED_IMPORT_SCHEMA_VERSION
    || !Array.isArray(candidate.trackIds)
    || candidate.trackIds.length < 1
    || candidate.trackIds.length > 10_000
    || !candidate.trackIds.every((id) => typeof id === 'string' && TRACK_ID_PATTERN.test(id))
    || !candidate.rowsById
    || typeof candidate.rowsById !== 'object'
    || Array.isArray(candidate.rowsById)
    || typeof candidate.savedAt !== 'number'
    || !Number.isFinite(candidate.savedAt)) return false;
  const allowed = new Set(candidate.trackIds);
  return Object.entries(candidate.rowsById).every(([id, row]) => allowed.has(id)
    && TRACK_ID_PATTERN.test(id)
    && row !== null
    && typeof row === 'object'
    && !Array.isArray(row)
    && row['Spotify Track ID'] === id);
}

export async function loadStoredSpotifyCopiedImport(): Promise<StoredSpotifyCopiedImport | null> {
  const database = await openDatabase();
  try {
    const value = await requestResult(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(LATEST_KEY));
    return isStoredSpotifyCopiedImport(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function saveStoredSpotifyCopiedImport(snapshot: StoredSpotifyCopiedImport): Promise<void> {
  if (!isStoredSpotifyCopiedImport(snapshot)) throw new Error('Copied-playlist checkpoint is invalid.');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(snapshot, LATEST_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearStoredSpotifyCopiedImport(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(LATEST_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Browser storage is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage could not be opened.'));
    request.onblocked = () => reject(new Error('Browser storage upgrade is blocked by another tab.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage transaction was aborted.'));
  });
}
