import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-recording-cache.json');
const ENDPOINT = 'https://musicbrainz.org/ws/2/recording/';
const USER_AGENT = 'SongsForSelf/0.3 (https://ai.rhyslindmark.com/music)';

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const limit = args.limit ? Math.max(1, Number(args.limit)) : Infinity;
const delayMs = Math.max(1100, Number(args['delay-ms'] ?? 1200));
const concurrency = Math.max(1, Math.min(4, Number(args.concurrency ?? 3)));

const rows = parse(fs.readFileSync(INPUT_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  : { tracks: {}, updatedAt: null };
cache.tracks ??= {};

const candidates = rows
  .filter((row) => row.spotify_track_id && !row.release_year)
  .filter((row) => !cache.tracks[row.spotify_track_id] || cache.tracks[row.spotify_track_id].retryable)
  .slice(0, limit);

let processed = 0;
const inFlight = new Set();
for (const row of candidates) {
  const task = processTrack(row).finally(() => inFlight.delete(task));
  inFlight.add(task);
  if (inFlight.size >= concurrency) await Promise.race(inFlight);
  if (processed < candidates.length) await sleep(delayMs);
}
await Promise.all(inFlight);

const entries = Object.values(cache.tracks);
console.log(JSON.stringify({
  cache: CACHE_PATH,
  processed,
  cached: entries.length,
  matched: entries.filter((entry) => entry.matched).length,
  retryable: entries.filter((entry) => entry.retryable).length,
}, null, 2));

async function processTrack(row) {
  try {
    cache.tracks[row.spotify_track_id] = await findRecording(row);
  } catch (error) {
    cache.tracks[row.spotify_track_id] = {
      spotifyTrackId: row.spotify_track_id,
      matched: false,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  processed += 1;
  if (processed % 25 === 0 || processed === candidates.length) console.log(`${processed}/${candidates.length}: ${row.artist_names} — ${row.track_name}`);
}

async function findRecording(row) {
  const primaryArtist = splitMulti(row.artist_names)[0] ?? '';
  const query = `recording:${quote(row.track_name)} AND artist:${quote(primaryArtist)}`;
  const url = `${ENDPOINT}?fmt=json&limit=8&query=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithRetry(url);
  const targetTitle = normalize(row.track_name);
  const targetArtist = normalize(primaryArtist);
  const targetDuration = Number(row.duration_ms);
  const ranked = (payload.recordings ?? []).map((recording) => {
    const titleSimilarity = similarity(targetTitle, normalize(recording.title));
    const artistSimilarity = Math.max(0, ...(recording['artist-credit'] ?? []).map((credit) => similarity(targetArtist, normalize(credit.artist?.name ?? credit.name ?? ''))));
    const durationDifference = Number.isFinite(targetDuration) && Number.isFinite(Number(recording.length))
      ? Math.abs(targetDuration - Number(recording.length))
      : null;
    const durationBonus = durationDifference === null ? 0 : durationDifference <= 3000 ? 12 : durationDifference <= 12000 ? 5 : 0;
    return {
      recording,
      titleSimilarity,
      artistSimilarity,
      durationDifference,
      combined: Number(recording.score ?? 0) + titleSimilarity * 20 + artistSimilarity * 15 + durationBonus,
    };
  }).sort((left, right) => right.combined - left.combined);
  const best = ranked[0];
  const date = best?.recording?.['first-release-date'] ?? '';
  const accepted = Boolean(best && date && best.titleSimilarity >= 0.84 && best.artistSimilarity >= 0.68 && Number(best.recording.score ?? 0) >= 78
    && (best.durationDifference === null || best.durationDifference <= 30000));
  if (!accepted) return { spotifyTrackId: row.spotify_track_id, matched: false, retryable: false };
  return {
    spotifyTrackId: row.spotify_track_id,
    matched: true,
    retryable: false,
    musicbrainzRecordingId: best.recording.id,
    matchedTitle: best.recording.title,
    matchedArtist: best.recording['artist-credit']?.map((credit) => credit.name ?? credit.artist?.name).filter(Boolean).join(', ') ?? '',
    firstReleaseDate: date,
    musicbrainzScore: Number(best.recording.score ?? 0),
    titleSimilarity: Number(best.titleSimilarity.toFixed(3)),
    artistSimilarity: Number(best.artistSimilarity.toFixed(3)),
    durationDifferenceMs: best.durationDifference,
  };
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`MusicBrainz request failed: ${response.status} ${await response.text()}`);
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
    .replace(/\b(feat(?:uring)?|with)\b.*$/i, '')
    .replace(/\s[-–—]\s(?:remaster(?:ed)?|live|radio edit|version|edit).*$/i, '')
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
