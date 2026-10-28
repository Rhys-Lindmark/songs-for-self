import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const CACHE_PATH = path.join(ROOT, 'data', 'wikidata-artist-name-cache.json');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SongsForSelf/0.3 (https://ai.rhyslindmark.com/music)';

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(40, Number(args['batch-size'] ?? 25)));
const delayMs = Math.max(1000, Number(args['delay-ms'] ?? 1300));
const limitBatches = args['limit-batches'] ? Number(args['limit-batches']) : Infinity;
const retryUnmatched = args['retry-unmatched'] === 'true';

const rows = parse(fs.readFileSync(INPUT_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  : { artists: {}, updatedAt: null };
cache.artists ??= {};

const artistNames = [...new Set(rows
  .filter((row) => row.spotify_track_id)
  .flatMap((row) => splitMulti(row.artist_names))
  .filter(Boolean))];
const pending = artistNames.filter((name) => !cache.artists[name] || (retryUnmatched && !cache.artists[name].matched));

let completedBatches = 0;
for (let offset = 0; offset < pending.length && completedBatches < limitBatches; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize);
  const results = await queryWikidata(batch);
  for (const name of batch) {
    const candidates = results[name] ?? [];
    cache.artists[name] = {
      name,
      matched: candidates.length > 0,
      candidates: candidates.sort((left, right) => candidateScore(right) - candidateScore(left)).slice(0, 5),
    };
  }
  cache.updatedAt = new Date().toISOString();
  saveJsonAtomic(CACHE_PATH, cache);
  completedBatches += 1;
  console.log(`${Math.min(offset + batch.length, pending.length)}/${pending.length} artist names cached`);
  if (offset + batch.length < pending.length) await sleep(delayMs);
}

const entries = Object.values(cache.artists);
console.log(JSON.stringify({
  cache: CACHE_PATH,
  totalNames: artistNames.length,
  cached: entries.length,
  matched: entries.filter((entry) => entry.matched).length,
  withPlace: entries.filter((entry) => entry.candidates?.some((candidate) => candidate.formationPlaces?.length || candidate.birthPlaces?.length)).length,
  withLifespan: entries.filter((entry) => entry.candidates?.some((candidate) => candidate.birthDates?.length || candidate.inceptionDates?.length)).length,
}, null, 2));

async function queryWikidata(names) {
  const values = names.map((name) => `${JSON.stringify(name)}@en`).join(' ');
  const query = `
    SELECT ?inputName ?item ?occupationLabel ?instanceLabel ?birthDate ?deathDate ?inceptionDate ?dissolvedDate
      ?formationPlaceLabel ?formationCoord ?formationCountryLabel
      ?birthPlaceLabel ?birthCoord ?birthCountryLabel ?citizenshipLabel WHERE {
      VALUES ?searchLabel { ${values} }
      ${retryUnmatched ? '{ ?item rdfs:label ?searchLabel. } UNION { ?item skos:altLabel ?searchLabel. }' : '?item rdfs:label ?searchLabel.'}
      BIND(STR(?searchLabel) AS ?inputName)
      OPTIONAL { ?item wdt:P106 ?occupation. ?occupation rdfs:label ?occupationLabel. FILTER(LANG(?occupationLabel) = "en") }
      OPTIONAL { ?item wdt:P31 ?instance. ?instance rdfs:label ?instanceLabel. FILTER(LANG(?instanceLabel) = "en") }
      OPTIONAL { ?item wdt:P569 ?birthDate. }
      OPTIONAL { ?item wdt:P570 ?deathDate. }
      OPTIONAL { ?item wdt:P571 ?inceptionDate. }
      OPTIONAL { ?item wdt:P576 ?dissolvedDate. }
      OPTIONAL {
        ?item wdt:P740 ?formationPlace.
        OPTIONAL { ?formationPlace wdt:P625 ?formationCoord. }
        OPTIONAL { ?formationPlace rdfs:label ?formationPlaceLabel. FILTER(LANG(?formationPlaceLabel) = "en") }
        OPTIONAL { ?formationPlace wdt:P17 ?formationCountry. ?formationCountry rdfs:label ?formationCountryLabel. FILTER(LANG(?formationCountryLabel) = "en") }
      }
      OPTIONAL {
        ?item wdt:P19 ?birthPlace.
        OPTIONAL { ?birthPlace wdt:P625 ?birthCoord. }
        OPTIONAL { ?birthPlace rdfs:label ?birthPlaceLabel. FILTER(LANG(?birthPlaceLabel) = "en") }
        OPTIONAL { ?birthPlace wdt:P17 ?birthCountry. ?birthCountry rdfs:label ?birthCountryLabel. FILTER(LANG(?birthCountryLabel) = "en") }
      }
      OPTIONAL { ?item wdt:P27 ?citizenship. ?citizenship rdfs:label ?citizenshipLabel. FILTER(LANG(?citizenshipLabel) = "en") }
    }
  `;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithRetry(url);
  const grouped = {};
  const candidates = new Map();
  for (const binding of payload.results?.bindings ?? []) {
    const inputName = binding.inputName?.value;
    const wikidataId = binding.item?.value?.split('/').pop();
    if (!inputName || !wikidataId) continue;
    const key = `${inputName}|${wikidataId}`;
    const candidate = candidates.get(key) ?? {
      wikidataId,
      occupations: [],
      instances: [],
      birthDates: [],
      deathDates: [],
      inceptionDates: [],
      dissolvedDates: [],
      formationPlaces: [],
      birthPlaces: [],
      countries: [],
    };
    addUnique(candidate.occupations, binding.occupationLabel?.value);
    addUnique(candidate.instances, binding.instanceLabel?.value);
    addUnique(candidate.birthDates, binding.birthDate?.value);
    addUnique(candidate.deathDates, binding.deathDate?.value);
    addUnique(candidate.inceptionDates, binding.inceptionDate?.value);
    addUnique(candidate.dissolvedDates, binding.dissolvedDate?.value);
    addPlace(candidate.formationPlaces, binding.formationPlaceLabel?.value, binding.formationCoord?.value, binding.formationCountryLabel?.value);
    addPlace(candidate.birthPlaces, binding.birthPlaceLabel?.value, binding.birthCoord?.value, binding.birthCountryLabel?.value);
    addUnique(candidate.countries, binding.citizenshipLabel?.value);
    candidates.set(key, candidate);
  }
  for (const [key, candidate] of candidates) {
    const inputName = key.slice(0, key.indexOf('|'));
    (grouped[inputName] ??= []).push(candidate);
  }
  return grouped;
}

function candidateScore(candidate) {
  const labels = [...candidate.occupations, ...candidate.instances].join(' ').toLowerCase();
  const musical = /music|singer|rapper|composer|pianist|guitarist|drummer|conductor|orchestra|band|choir|disc jockey|songwriter|record producer|instrumentalist/.test(labels);
  return (musical ? 100 : 0)
    + (candidate.formationPlaces.length ? 20 : 0)
    + (candidate.birthPlaces.length ? 15 : 0)
    + (candidate.countries.length ? 5 : 0)
    + (candidate.birthDates.length || candidate.inceptionDates.length ? 10 : 0);
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Wikidata request failed: ${response.status} ${await response.text()}`);
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(30000, 1800 * 2 ** attempt));
  }
  throw new Error('Wikidata request failed after retries');
}

function addUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function addPlace(values, label, coordinate, country) {
  if (!label && !coordinate) return;
  const key = `${label ?? ''}|${coordinate ?? ''}|${country ?? ''}`;
  if (!values.some((value) => value.key === key)) values.push({ key, label: label ?? '', coordinate: coordinate ?? '', country: country ?? '' });
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
