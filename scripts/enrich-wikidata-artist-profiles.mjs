import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CACHE_PATH = path.join(ROOT, 'data', 'wikidata-cache.json');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SongsForSelf/0.3 (https://ai.rhyslindmark.com/music)';
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(80, Number(args['batch-size'] ?? 60)));
const delayMs = Math.max(1000, Number(args['delay-ms'] ?? 1100));

const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
const qidToArtistIds = new Map();
for (const [artistId, artist] of Object.entries(cache.artist ?? {})) {
  if (!artist.matched || !artist.wikidataId || artist.profileEnriched) continue;
  if (!qidToArtistIds.has(artist.wikidataId)) qidToArtistIds.set(artist.wikidataId, []);
  qidToArtistIds.get(artist.wikidataId).push(artistId);
}
const pending = [...qidToArtistIds.keys()];

for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize);
  const profiles = await queryProfiles(batch);
  for (const qid of batch) {
    for (const artistId of qidToArtistIds.get(qid) ?? []) {
      Object.assign(cache.artist[artistId], profiles[qid] ?? {}, { profileEnriched: true });
    }
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  console.log(`${Math.min(offset + batch.length, pending.length)}/${pending.length} exact artist profiles cached`);
  if (offset + batch.length < pending.length) await sleep(delayMs);
}

console.log(JSON.stringify({ cache: CACHE_PATH, processed: pending.length }, null, 2));

async function queryProfiles(qids) {
  const values = qids.map((qid) => `wd:${qid}`).join(' ');
  const query = `
    SELECT ?item ?birthDate ?deathDate ?inceptionDate ?dissolvedDate ?occupationLabel WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P569 ?birthDate. }
      OPTIONAL { ?item wdt:P570 ?deathDate. }
      OPTIONAL { ?item wdt:P571 ?inceptionDate. }
      OPTIONAL { ?item wdt:P576 ?dissolvedDate. }
      OPTIONAL { ?item wdt:P106 ?occupation. ?occupation rdfs:label ?occupationLabel. FILTER(LANG(?occupationLabel) = "en") }
    }
  `;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithRetry(url);
  const profiles = {};
  for (const binding of payload.results?.bindings ?? []) {
    const qid = binding.item?.value?.split('/').pop();
    if (!qid) continue;
    const profile = profiles[qid] ??= { birthDates: [], deathDates: [], inceptionDates: [], dissolvedDates: [], occupations: [] };
    addUnique(profile.birthDates, binding.birthDate?.value);
    addUnique(profile.deathDates, binding.deathDate?.value);
    addUnique(profile.inceptionDates, binding.inceptionDate?.value);
    addUnique(profile.dissolvedDates, binding.dissolvedDate?.value);
    addUnique(profile.occupations, binding.occupationLabel?.value);
  }
  return profiles;
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Wikidata request failed: ${response.status} ${await response.text()}`);
    await sleep(Math.min(30000, 1800 * 2 ** attempt));
  }
  throw new Error('Wikidata request failed after retries');
}

function addUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function saveJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
