import type { AnalyzedTrack } from '@/lib/playlist-analyzer';

const DATABASE_NAME = 'songs-for-self-browser-data';
const STORE_NAME = 'playlist-analyses';
const LATEST_KEY = 'latest';
export const PLAYLIST_ANALYSIS_SCHEMA_VERSION = 1;

export type StoredPlaylistAnalysis = {
  version: typeof PLAYLIST_ANALYSIS_SCHEMA_VERSION;
  sourceName: string;
  savedAt: number;
  tracks: AnalyzedTrack[];
};

export function makeStoredPlaylistAnalysis(sourceName: string, tracks: AnalyzedTrack[], savedAt = Date.now()): StoredPlaylistAnalysis {
  return { version: PLAYLIST_ANALYSIS_SCHEMA_VERSION, sourceName, savedAt, tracks };
}

export function isStoredPlaylistAnalysis(value: unknown): value is StoredPlaylistAnalysis {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredPlaylistAnalysis>;
  return candidate.version === PLAYLIST_ANALYSIS_SCHEMA_VERSION
    && typeof candidate.sourceName === 'string'
    && candidate.sourceName.length > 0
    && typeof candidate.savedAt === 'number'
    && Number.isFinite(candidate.savedAt)
    && Array.isArray(candidate.tracks)
    && candidate.tracks.length > 0
    && candidate.tracks.every(isAnalyzedTrack);
}

export async function loadStoredPlaylistAnalysis(): Promise<StoredPlaylistAnalysis | null> {
  const database = await openDatabase();
  try {
    const value = await requestResult(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(LATEST_KEY));
    return isStoredPlaylistAnalysis(value) ? value : null;
  } finally {
    database.close();
  }
}

export async function saveStoredPlaylistAnalysis(snapshot: StoredPlaylistAnalysis): Promise<void> {
  if (!isStoredPlaylistAnalysis(snapshot)) throw new Error('Playlist checkpoint is invalid.');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(snapshot, LATEST_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearStoredPlaylistAnalysis(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(LATEST_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

function isAnalyzedTrack(value: unknown): value is AnalyzedTrack {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<AnalyzedTrack>;
  return typeof track.track === 'string'
    && typeof track.artist === 'string'
    && typeof track.genre === 'string'
    && (track.spotifyTrackId === null || typeof track.spotifyTrackId === 'string')
    && (track.year === null || typeof track.year === 'number')
    && (track.x === null || typeof track.x === 'number')
    && (track.y === null || typeof track.y === 'number')
    && typeof track.method === 'string'
    && typeof track.genreSource === 'string'
    && typeof track.timeSource === 'string'
    && typeof track.geographySource === 'string';
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
