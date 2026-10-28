import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const cachePath = path.join(root, 'data', 'discogs-release-genre-cache.json');
const cache = readJson(cachePath, { version: 1, albums: {}, updatedAt: null });
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const limit = Math.max(1, Number(args.limit ?? 1000));
const delayMs = Math.max(2500, Number(args['delay-ms'] ?? 2600));
const retryUnmatched = args['retry-unmatched'] === 'true';
const userAgent = 'SongsForSelf/0.5 +https://ai.rhyslindmark.com/music';

const candidates = [...new Map(rows
  .filter((row) => row.spotify_track_id && row.genre_family === 'Other' && row.spotify_album_id)
  .map((row) => [row.spotify_album_id, {
    spotifyAlbumId: row.spotify_album_id,
    albumName: row.album_name,
    artistName: row.artist_names.split(';')[0].trim(),
    trackCount: 0,
  }])).values()];
for (const candidate of candidates) {
  candidate.trackCount = rows.filter((row) => row.genre_family === 'Other' && row.spotify_album_id === candidate.spotifyAlbumId).length;
}
const pending = candidates
  .filter((candidate) => !cache.albums?.[candidate.spotifyAlbumId]
    || cache.albums[candidate.spotifyAlbumId].retryable
    || (retryUnmatched && !cache.albums[candidate.spotifyAlbumId].matched && !cache.albums[candidate.spotifyAlbumId].fallbackTried))
  .sort((left, right) => right.trackCount - left.trackCount || left.artistName.localeCompare(right.artistName) || left.albumName.localeCompare(right.albumName))
  .slice(0, limit);

let processed = 0;
for (const candidate of pending) {
  try {
    const skipFielded = Boolean(retryUnmatched && cache.albums[candidate.spotifyAlbumId] && !cache.albums[candidate.spotifyAlbumId].matched);
    cache.albums[candidate.spotifyAlbumId] = await findRelease(candidate, skipFielded);
  } catch (error) {
    cache.albums[candidate.spotifyAlbumId] = {
      ...candidate,
      matched: false,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      fetchedAt: new Date().toISOString(),
    };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(cachePath, cache);
  processed += 1;
  if (processed % 25 === 0 || processed === pending.length) console.log(`${processed}/${pending.length} Discogs album profiles cached`);
  if (processed < pending.length) await sleep(delayMs);
}

const entries = Object.values(cache.albums);
console.log(JSON.stringify({
  requested: pending.length,
  cached: entries.length,
  matched: entries.filter((entry) => entry.matched).length,
  withGenres: entries.filter((entry) => entry.genres?.length).length,
  withStyles: entries.filter((entry) => entry.styles?.length).length,
  coveredTracks: entries.filter((entry) => entry.matched).reduce((sum, entry) => sum + Number(entry.trackCount ?? 0), 0),
  retryable: entries.filter((entry) => entry.retryable).length,
}, null, 2));

async function findRelease(candidate, skipFielded = false) {
  if (!skipFielded) {
    const query = new URLSearchParams({
      type: 'release',
      release_title: candidate.albumName,
      artist: candidate.artistName,
      per_page: '10',
    });
    const response = await fetchWithRetry(`https://api.discogs.com/database/search?${query}`);
    const payload = await response.json();
    const fieldedMatch = selectRelease(payload.results, candidate);
    if (fieldedMatch) return releaseEvidence(candidate, fieldedMatch, 'fielded-query');
  }
  if (!retryUnmatched) return { ...candidate, matched: false, retryable: false, fallbackTried: false, fetchedAt: new Date().toISOString() };
  if (!skipFielded) await sleep(delayMs);
  const fallbackQuery = new URLSearchParams({
    type: 'release',
    q: `${candidate.artistName} ${candidate.albumName}`,
    per_page: '20',
  });
  const fallbackResponse = await fetchWithRetry(`https://api.discogs.com/database/search?${fallbackQuery}`);
  const fallbackPayload = await fallbackResponse.json();
  const fallbackMatch = selectRelease(fallbackPayload.results, candidate);
  return fallbackMatch
    ? releaseEvidence(candidate, fallbackMatch, 'broad-query')
    : { ...candidate, matched: false, retryable: false, fallbackTried: true, fetchedAt: new Date().toISOString() };
}

function selectRelease(results = [], candidate) {
  const targetAlbum = normalizeAlbum(candidate.albumName);
  const targetArtist = normalizeArtist(candidate.artistName);
  const ranked = results.map((release) => {
    const [resultArtist, ...titleParts] = String(release.title ?? '').split(' - ');
    const resultAlbum = titleParts.join(' - ') || release.title || '';
    const titleSimilarity = similarity(targetAlbum, normalizeAlbum(resultAlbum));
    const artistSimilarity = similarity(targetArtist, normalizeArtist(resultArtist));
    const unofficialPenalty = (release.format ?? []).some((value) => /unofficial/i.test(value)) ? 15 : 0;
    return {
      release,
      titleSimilarity,
      artistSimilarity,
      combined: titleSimilarity * 55 + artistSimilarity * 45 - unofficialPenalty,
    };
  }).sort((left, right) => right.combined - left.combined || Number(right.release.community?.have ?? 0) - Number(left.release.community?.have ?? 0));
  const best = ranked[0];
  const accepted = Boolean(best && best.titleSimilarity >= 0.86 && best.artistSimilarity >= 0.72 && best.combined >= 82);
  return accepted ? best : null;
}

function releaseEvidence(candidate, match, matchMethod) {
  const release = match.release;
  return {
    ...candidate,
    matched: true,
    retryable: false,
    discogsReleaseId: release.id,
    discogsMasterId: release.master_id || null,
    matchedTitle: release.title,
    titleSimilarity: match.titleSimilarity,
    artistSimilarity: match.artistSimilarity,
    matchMethod,
    genres: release.genre ?? [],
    styles: release.style ?? [],
    country: release.country ?? '',
    year: release.year || null,
    sourceUrl: `https://www.discogs.com${release.uri}`,
    fallbackTried: matchMethod === 'broad-query',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': userAgent } });
    if (response.ok) return response;
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Discogs request failed: ${response.status} ${await response.text()}`);
    const retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1000;
    await sleep(Math.max(retryAfter, Math.min(60000, 3000 * 2 ** attempt)));
  }
  throw new Error('Discogs request failed after retries');
}

function normalizeArtist(value = '') {
  return normalize(value).replace(/\s+\d+$/, '');
}

function normalizeAlbum(value = '') {
  return normalize(value)
    .replace(/\b(deluxe|expanded|remastered|anniversary|special|bonus track|original motion picture soundtrack|original soundtrack|ep|single|version|edition)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function saveJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
