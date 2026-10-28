import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-cache.json');
const ENDPOINT = 'https://musicbrainz.org/ws/2/release-group/';
const USER_AGENT = 'SongsForSelf/0.2 (https://ai.rhyslindmark.com/songs-for-self)';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const limit = args.limit ? Math.max(1, Number(args.limit)) : Infinity;
const delayMs = Math.max(1100, Number(args['delay-ms'] ?? 1200));
const concurrency = Math.max(1, Math.min(8, Number(args.concurrency ?? 6)));

const rows = parse(fs.readFileSync(INPUT_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  : { albums: {}, updatedAt: null };
cache.albums ??= {};

const candidates = [...new Map(rows
  .filter((row) => row.data_status !== 'unavailable' && !row.release_year && row.spotify_album_id)
  .map((row) => [row.spotify_album_id, {
    spotifyAlbumId: row.spotify_album_id,
    albumName: row.album_name,
    artistName: row.artist_names?.split('; ')[0] ?? '',
  }])).values()]
  .filter((album) => !cache.albums[album.spotifyAlbumId] || cache.albums[album.spotifyAlbumId].retryable)
  .slice(0, limit);

let processed = 0;
const inFlight = new Set();
for (const album of candidates) {
  const task = processAlbum(album).finally(() => inFlight.delete(task));
  inFlight.add(task);
  if (inFlight.size >= concurrency) await Promise.race(inFlight);
  if (processed < candidates.length) await sleep(delayMs);
}
await Promise.all(inFlight);

const entries = Object.values(cache.albums);
console.log(JSON.stringify({
  cache: CACHE_PATH,
  processed,
  cached: entries.length,
  matched: entries.filter((entry) => entry.matched).length,
  retryable: entries.filter((entry) => entry.retryable).length,
}, null, 2));

async function processAlbum(album) {
  try {
    cache.albums[album.spotifyAlbumId] = await findReleaseGroup(album);
  } catch (error) {
    cache.albums[album.spotifyAlbumId] = {
      ...album,
      matched: false,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  processed += 1;
  if (processed % 25 === 0 || processed === candidates.length) {
    console.log(`${processed}/${candidates.length}: ${album.artistName} — ${album.albumName}`);
  }
}

async function findReleaseGroup(album) {
  const query = `releasegroup:${quote(album.albumName)} AND artist:${quote(album.artistName)}`;
  const url = `${ENDPOINT}?fmt=json&limit=8&query=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithRetry(url);
  const targetTitle = normalize(album.albumName);
  const targetArtist = normalize(album.artistName);
  const ranked = (payload['release-groups'] ?? []).map((releaseGroup) => {
    const titleSimilarity = similarity(targetTitle, normalize(releaseGroup.title));
    const artistSimilarity = Math.max(0, ...(releaseGroup['artist-credit'] ?? []).map((credit) =>
      similarity(targetArtist, normalize(credit.artist?.name ?? credit.name ?? ''))));
    return {
      releaseGroup,
      titleSimilarity,
      artistSimilarity,
      combined: Number(releaseGroup.score ?? 0) + titleSimilarity * 20 + artistSimilarity * 15,
    };
  }).sort((a, b) => b.combined - a.combined);
  const best = ranked[0];
  const date = best?.releaseGroup?.['first-release-date'] ?? '';
  const accepted = Boolean(best && date && best.titleSimilarity >= 0.86 && best.artistSimilarity >= 0.72 && Number(best.releaseGroup.score ?? 0) >= 80);
  if (!accepted) return { ...album, matched: false, retryable: false };
  return {
    ...album,
    matched: true,
    retryable: false,
    musicbrainzReleaseGroupId: best.releaseGroup.id,
    matchedTitle: best.releaseGroup.title,
    matchedArtist: best.releaseGroup['artist-credit']?.map((credit) => credit.name ?? credit.artist?.name).filter(Boolean).join(', ') ?? '',
    firstReleaseDate: date,
    musicbrainzScore: Number(best.releaseGroup.score ?? 0),
    titleSimilarity: Number(best.titleSimilarity.toFixed(3)),
    artistSimilarity: Number(best.artistSimilarity.toFixed(3)),
  };
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`MusicBrainz request failed: ${response.status} ${await response.text()}`);
    }
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(30000, 2000 * 2 ** attempt));
  }
  throw new Error('MusicBrainz request failed after retries');
}

function quote(value) {
  return JSON.stringify(String(value ?? ''));
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(deluxe|remaster(?:ed)?|expanded|anniversary|edition|version)\b.*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function saveJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
