import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ARTIST_CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-artist-cache.json');
const CACHE_PATH = path.join(ROOT, 'data', 'wikidata-musicbrainz-area-cache.json');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SongsForSelf/0.3 (https://ai.rhyslindmark.com/music)';
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(80, Number(args['batch-size'] ?? 60)));
const delayMs = Math.max(1000, Number(args['delay-ms'] ?? 1100));

const artistCache = readJson(ARTIST_CACHE_PATH, { artists: {} });
const cache = readJson(CACHE_PATH, { areas: {}, updatedAt: null });
cache.areas ??= {};
const ids = [...new Set(Object.values(artistCache.artists ?? {}).flatMap((artist) => [artist.beginAreaId, artist.areaId]).filter(Boolean))];
const pending = ids.filter((id) => !cache.areas[id]);

for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize);
  const results = await queryAreas(batch);
  for (const id of batch) cache.areas[id] = results[id] ?? { musicbrainzAreaId: id, matched: false };
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  console.log(`${Math.min(offset + batch.length, pending.length)}/${pending.length} MusicBrainz areas cached`);
  if (offset + batch.length < pending.length) await sleep(delayMs);
}
const entries = Object.values(cache.areas);
console.log(JSON.stringify({ cache: CACHE_PATH, cached: entries.length, withCoordinates: entries.filter((entry) => entry.coordinate).length }, null, 2));

async function queryAreas(ids) {
  const values = ids.map((id) => JSON.stringify(id)).join(' ');
  const query = `
    SELECT ?musicbrainzAreaId ?item ?itemLabel ?coordinate ?countryLabel WHERE {
      VALUES ?musicbrainzAreaId { ${values} }
      ?item wdt:P982 ?musicbrainzAreaId.
      OPTIONAL { ?item wdt:P625 ?coordinate. }
      OPTIONAL { ?item wdt:P17 ?country. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Wikidata request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const results = {};
  for (const binding of payload.results?.bindings ?? []) {
    const id = binding.musicbrainzAreaId?.value;
    if (!id) continue;
    const candidate = {
      musicbrainzAreaId: id,
      matched: true,
      wikidataId: binding.item?.value?.split('/').pop() ?? '',
      label: binding.itemLabel?.value ?? '',
      coordinate: binding.coordinate?.value ?? '',
      country: binding.countryLabel?.value ?? '',
    };
    if (!results[id]?.coordinate || candidate.coordinate) results[id] = candidate;
  }
  return results;
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
