import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-cache.json');
const ENDPOINT = 'https://musicbrainz.org/ws/2/release-group/';
const USER_AGENT = 'SongsForSelf/0.3 (https://ai.rhyslindmark.com/music)';
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(15, Number(args['batch-size'] ?? 10)));
const delayMs = Math.max(1100, Number(args['delay-ms'] ?? 1200));
const concurrency = Math.max(1, Math.min(3, Number(args.concurrency ?? 3)));
const limit = args.limit ? Math.max(1, Number(args.limit)) : Infinity;

const rows = parse(fs.readFileSync(INPUT_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
cache.albums ??= {};
const candidates = [...new Map(rows
  .filter((row) => row.spotify_track_id && /^(estimate|inferred):/.test(row.release_year_source) && row.spotify_album_id)
  .map((row) => [row.spotify_album_id, {
    spotifyAlbumId: row.spotify_album_id,
    albumName: row.album_name,
    artistName: splitMulti(row.artist_names)[0] ?? '',
  }])).values()]
  .filter((album) => !cache.albums[album.spotifyAlbumId]?.matched)
  .slice(0, limit);
const batches = [];
for (let offset = 0; offset < candidates.length; offset += batchSize) batches.push(candidates.slice(offset, offset + batchSize));

let processed = 0;
const inFlight = new Set();
for (const batch of batches) {
  const task = processBatch(batch).finally(() => inFlight.delete(task));
  inFlight.add(task);
  if (inFlight.size >= concurrency) await Promise.race(inFlight);
  if (processed < candidates.length) await sleep(delayMs);
}
await Promise.all(inFlight);

const entries = Object.values(cache.albums);
console.log(JSON.stringify({ cache: CACHE_PATH, processed, matched: entries.filter((entry) => entry.matched).length, cached: entries.length }, null, 2));

async function processBatch(albums) {
  try {
    const matches = await searchAlbums(albums);
    for (const album of albums) cache.albums[album.spotifyAlbumId] = matches[album.spotifyAlbumId] ?? { ...album, matched: false, retryable: false };
  } catch (error) {
    for (const album of albums) cache.albums[album.spotifyAlbumId] = { ...album, matched: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  processed += albums.length;
  console.log(`${processed}/${candidates.length} albums searched`);
}

async function searchAlbums(albums) {
  const query = albums.map((album) => `(releasegroup:${quote(normalizeAlbum(album.albumName))} AND artist:${quote(normalize(album.artistName))})`).join(' OR ');
  const url = `${ENDPOINT}?fmt=json&limit=100&query=${encodeURIComponent(query)}`;
  const response = await fetchJsonWithRetry(url);
  const results = {};
  for (const album of albums) {
    const targetTitle = normalizeAlbum(album.albumName);
    const targetArtist = normalize(album.artistName);
    const ranked = (response['release-groups'] ?? []).map((releaseGroup) => {
      const titleSimilarity = similarity(targetTitle, normalizeAlbum(releaseGroup.title));
      const artistSimilarity = Math.max(0, ...(releaseGroup['artist-credit'] ?? []).map((credit) => similarity(targetArtist, normalize(credit.artist?.name ?? credit.name ?? ''))));
      return { releaseGroup, titleSimilarity, artistSimilarity, combined: Number(releaseGroup.score ?? 0) + titleSimilarity * 20 + artistSimilarity * 15 };
    }).sort((left, right) => right.combined - left.combined);
    const best = ranked[0];
    const date = best?.releaseGroup?.['first-release-date'] ?? '';
    if (!best || !date || best.titleSimilarity < 0.84 || best.artistSimilarity < 0.68 || Number(best.releaseGroup.score ?? 0) < 72) continue;
    results[album.spotifyAlbumId] = {
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
      lookupMethod: 'batched-release-group-search',
    };
  }
  return results;
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`MusicBrainz request failed: ${response.status} ${await response.text()}`);
    await sleep(Math.min(30000, 2000 * 2 ** attempt));
  }
  throw new Error('MusicBrainz request failed after retries');
}

function quote(value) {
  return JSON.stringify(String(value ?? ''));
}

function normalizeAlbum(value) {
  return normalize(value).replace(/\b(deluxe|remaster(?:ed)?|expanded|anniversary|edition|version|original motion picture soundtrack|bonus track)\b.*$/i, '').trim();
}

function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

function splitMulti(value = '') {
  return value ? value.split('; ').filter(Boolean) : [];
}

function saveJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
