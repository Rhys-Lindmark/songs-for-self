import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const artistCache = readJson(path.join(root, 'data', 'musicbrainz-artist-cache.json'), { artists: {} });
const cachePath = path.join(root, 'data', 'musicbrainz-artist-genre-cache.json');
const cache = readJson(cachePath, { version: 1, artists: {}, updatedAt: null });
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const limit = Math.max(1, Number(args.limit ?? 250));
const delayMs = Math.max(1100, Number(args['delay-ms'] ?? 1100));
const userAgent = 'SongsForSelf/0.4 (https://ai.rhyslindmark.com/music)';

const frequencies = new Map();
for (const row of rows.filter((item) => item.spotify_track_id && item.genre_family === 'Other' && !item.genre_source.startsWith('editorial:genre-decision-queue'))) {
  const primaryArtist = row.artist_names.split(';')[0].trim();
  frequencies.set(primaryArtist, (frequencies.get(primaryArtist) ?? 0) + 1);
}
const candidates = [...frequencies]
  .filter(([artist]) => artistCache.artists?.[artist]?.matched && !cache.artists?.[artist])
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, limit);

let processed = 0;
for (const [artist, trackCount] of candidates) {
  const match = artistCache.artists[artist];
  const url = `https://musicbrainz.org/ws/2/artist/${match.musicbrainzArtistId}?inc=genres+tags&fmt=json`;
  try {
    const payload = await fetchJsonWithRetry(url);
    cache.artists[artist] = {
      artist,
      trackCount,
      musicbrainzArtistId: match.musicbrainzArtistId,
      matchedName: match.matchedName,
      matchScore: match.score,
      genres: ranked(payload.genres),
      tags: ranked(payload.tags),
      sourceUrl: `https://musicbrainz.org/artist/${match.musicbrainzArtistId}`,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    cache.artists[artist] = {
      artist,
      trackCount,
      musicbrainzArtistId: match.musicbrainzArtistId,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
      fetchedAt: new Date().toISOString(),
    };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(cachePath, cache);
  processed += 1;
  if (processed % 25 === 0 || processed === candidates.length) console.log(`${processed}/${candidates.length} artist genre profiles cached`);
  if (processed < candidates.length) await sleep(delayMs);
}

const entries = Object.values(cache.artists);
console.log(JSON.stringify({
  requested: candidates.length,
  cached: entries.length,
  withGenres: entries.filter((entry) => entry.genres?.length).length,
  withTags: entries.filter((entry) => entry.tags?.length).length,
  retryable: entries.filter((entry) => entry.retryable).length,
}, null, 2));

function ranked(values = []) {
  return values
    .map((value) => ({ name: value.name, count: Number(value.count ?? 0) }))
    .filter((value) => value.name)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': userAgent } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`MusicBrainz request failed: ${response.status} ${await response.text()}`);
    await sleep(Math.min(30000, 2000 * 2 ** attempt));
  }
  throw new Error('MusicBrainz request failed after retries');
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
