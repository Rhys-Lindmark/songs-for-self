import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const nameCache = readJson(path.join(root, 'data', 'wikidata-artist-name-cache.json'), { artists: {} });
const cachePath = path.join(root, 'data', 'wikidata-artist-genre-cache.json');
const cache = readJson(cachePath, { version: 1, artists: {}, updatedAt: null });
const endpoint = 'https://query.wikidata.org/sparql';
const userAgent = 'SongsForSelf/0.4 (https://ai.rhyslindmark.com/music)';
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(60, Number(args['batch-size'] ?? 50)));
const limit = args.limit ? Math.max(1, Number(args.limit)) : Infinity;
const delayMs = Math.max(1000, Number(args['delay-ms'] ?? 1100));

const frequencies = new Map();
for (const row of rows.filter((item) => item.spotify_track_id && item.genre_family === 'Other')) {
  const artist = row.artist_names.split(';')[0].trim();
  frequencies.set(artist, (frequencies.get(artist) ?? 0) + 1);
}
const candidates = [...frequencies].flatMap(([artist, trackCount]) => {
  if (cache.artists?.[artist]) return [];
  const musicalCandidates = (nameCache.artists?.[artist]?.candidates ?? []).filter(isMusicalCandidate);
  if (musicalCandidates.length !== 1) return [];
  return [{ artist, trackCount, ...musicalCandidates[0] }];
}).sort((left, right) => right.trackCount - left.trackCount || left.artist.localeCompare(right.artist)).slice(0, limit);

for (let offset = 0; offset < candidates.length; offset += batchSize) {
  const batch = candidates.slice(offset, offset + batchSize);
  const profiles = await fetchGenres(batch.map((candidate) => candidate.wikidataId));
  for (const candidate of batch) {
    cache.artists[candidate.artist] = {
      artist: candidate.artist,
      trackCount: candidate.trackCount,
      wikidataId: candidate.wikidataId,
      occupations: candidate.occupations ?? [],
      instances: candidate.instances ?? [],
      genres: profiles[candidate.wikidataId] ?? [],
      sourceUrl: `https://www.wikidata.org/wiki/${candidate.wikidataId}`,
      matchMethod: 'exact-name-single-musical-candidate',
      fetchedAt: new Date().toISOString(),
    };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(cachePath, cache);
  console.log(`${Math.min(offset + batch.length, candidates.length)}/${candidates.length} Wikidata artist genre profiles cached`);
  if (offset + batch.length < candidates.length) await sleep(delayMs);
}

const entries = Object.values(cache.artists);
console.log(JSON.stringify({
  requested: candidates.length,
  cached: entries.length,
  withGenres: entries.filter((entry) => entry.genres?.length).length,
  coveredTracks: entries.filter((entry) => entry.genres?.length).reduce((total, entry) => total + entry.trackCount, 0),
}, null, 2));

async function fetchGenres(qids) {
  const query = `
    SELECT ?item ?genreLabel WHERE {
      VALUES ?item { ${qids.map((qid) => `wd:${qid}`).join(' ')} }
      OPTIONAL { ?item wdt:P136 ?genre. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const response = await fetchWithRetry(`${endpoint}?format=json&query=${encodeURIComponent(query)}`);
  const output = Object.fromEntries(qids.map((qid) => [qid, []]));
  for (const binding of response.results?.bindings ?? []) {
    const qid = binding.item?.value?.split('/').pop();
    const label = binding.genreLabel?.value;
    if (qid && label && !output[qid].includes(label)) output[qid].push(label);
  }
  return output;
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': userAgent } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Wikidata request failed: ${response.status} ${await response.text()}`);
    await sleep(Math.min(30000, 1800 * 2 ** attempt));
  }
  throw new Error('Wikidata request failed after retries');
}

function isMusicalCandidate(candidate) {
  return /music|singer|rapper|composer|pianist|guitarist|drummer|conductor|orchestra|band|choir|disc jockey|songwriter|record producer|instrumentalist/
    .test([...(candidate.occupations ?? []), ...(candidate.instances ?? [])].join(' ').toLowerCase());
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
