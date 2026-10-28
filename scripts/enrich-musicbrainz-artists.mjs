import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { parsePoint } from './music-taxonomy.mjs';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const WIKIDATA_CACHE_PATH = path.join(ROOT, 'data', 'wikidata-cache.json');
const NAME_CACHE_PATH = path.join(ROOT, 'data', 'wikidata-artist-name-cache.json');
const CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-artist-cache.json');
const ENDPOINT = 'https://musicbrainz.org/ws/2/artist/';
const USER_AGENT = 'SongsForSelf/0.3 (https://ai.rhyslindmark.com/music)';
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(20, Number(args['batch-size'] ?? 15)));
const delayMs = Math.max(1100, Number(args['delay-ms'] ?? 1200));
const concurrency = Math.max(1, Math.min(3, Number(args.concurrency ?? 3)));

const rows = parse(fs.readFileSync(INPUT_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const wikidataCache = readJson(WIKIDATA_CACHE_PATH, { artist: {} });
const nameCache = readJson(NAME_CACHE_PATH, { artists: {} });
const cache = readJson(CACHE_PATH, { artists: {}, updatedAt: null });
cache.artists ??= {};

const idToHasPlace = new Map(Object.entries(wikidataCache.artist ?? {}).map(([id, artist]) => [id, Boolean(placeFromArtist(artist))]));
const candidates = [...new Set(rows.flatMap((row) => {
  const names = splitMulti(row.artist_names);
  const ids = splitMulti(row.spotify_artist_ids);
  return names.filter((name, index) => {
    if (idToHasPlace.get(ids[index])) return false;
    const nameEntry = nameCache.artists?.[name];
    return !nameEntry?.candidates?.some((candidate) => placeFromArtist(candidate));
  });
}))].filter((name) => !cache.artists[name]);

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

const entries = Object.values(cache.artists);
console.log(JSON.stringify({
  cache: CACHE_PATH,
  candidates: candidates.length,
  cached: entries.length,
  matched: entries.filter((entry) => entry.matched).length,
  withArea: entries.filter((entry) => entry.area || entry.beginArea || entry.country).length,
}, null, 2));

async function processBatch(names) {
  try {
    const results = await searchArtists(names);
    for (const name of names) cache.artists[name] = results[name] ?? { name, matched: false, retryable: false };
  } catch (error) {
    for (const name of names) cache.artists[name] = { name, matched: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  processed += names.length;
  console.log(`${processed}/${candidates.length} artist names searched`);
}

async function searchArtists(names) {
  const query = names.map((name) => `artist:${quote(name)}`).join(' OR ');
  const url = `${ENDPOINT}?fmt=json&limit=100&query=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithRetry(url);
  const output = {};
  for (const name of names) {
    const normalized = normalize(name);
    const matches = (payload.artists ?? []).filter((artist) => {
      const labels = [artist.name, artist['sort-name'], ...(artist.aliases ?? []).map((alias) => alias.name)];
      return labels.some((label) => normalize(label) === normalized);
    }).sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0));
    const best = matches[0];
    if (!best || Number(best.score ?? 0) < 75) continue;
    output[name] = {
      name,
      matched: true,
      retryable: false,
      musicbrainzArtistId: best.id,
      matchedName: best.name,
      score: Number(best.score ?? 0),
      type: best.type ?? '',
      country: best.country ?? '',
      area: best.area?.name ?? '',
      areaId: best.area?.id ?? '',
      beginArea: best['begin-area']?.name ?? '',
      beginAreaId: best['begin-area']?.id ?? '',
      beginDate: best['life-span']?.begin ?? '',
      endDate: best['life-span']?.end ?? '',
    };
  }
  return output;
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

function placeFromArtist(artist) {
  return [...(artist?.formationPlaces ?? []), ...(artist?.birthPlaces ?? [])].find((place) => parsePoint(place.coordinate));
}

function quote(value) {
  return JSON.stringify(String(value ?? ''));
}

function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitMulti(value = '') {
  return value ? value.split('; ').filter(Boolean) : [];
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
