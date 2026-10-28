import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { classifyGenres, parsePoint } from './music-taxonomy.mjs';

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, 'data', 'songs-for-self.raw.csv');
const OUTPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const CACHE_PATH = path.join(ROOT, 'data', 'wikidata-cache.json');
const MUSICBRAINZ_CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-cache.json');
const USER_AGENT = 'SongsForSelf/0.1 (https://ai.rhyslindmark.com/songs-for-self)';
const ENDPOINT = 'https://query.wikidata.org/sparql';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const batchSize = Math.max(1, Math.min(80, Number(args['batch-size'] ?? 40)));
const delayMs = Math.max(1000, Number(args['delay-ms'] ?? 1100));
const limitBatches = args['limit-batches'] ? Number(args['limit-batches']) : Infinity;
const requestedTypes = new Set((args.types ?? 'artist,album,track').split(','));

const rows = parse(fs.readFileSync(RAW_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  : { artist: {}, album: {}, track: {}, updatedAt: null };
for (const type of ['artist', 'album', 'track']) cache[type] ??= {};
const musicbrainzCache = fs.existsSync(MUSICBRAINZ_CACHE_PATH)
  ? JSON.parse(fs.readFileSync(MUSICBRAINZ_CACHE_PATH, 'utf8'))
  : { albums: {} };

const ids = {
  artist: [...new Set(rows.flatMap((row) => splitMulti(row.spotify_artist_ids)).filter(Boolean))],
  album: [...new Set(rows.map((row) => row.spotify_album_id).filter(Boolean))],
  track: [...new Set(rows.map((row) => row.spotify_track_id).filter(Boolean))],
};

let completedBatches = 0;
for (const type of ['artist', 'album', 'track']) {
  if (!requestedTypes.has(type)) continue;
  const pending = ids[type].filter((id) => !cache[type][id]);
  for (let offset = 0; offset < pending.length && completedBatches < limitBatches; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const results = await queryWikidata(type, batch);
    for (const id of batch) cache[type][id] = results[id] ?? { spotifyId: id, matched: false };
    cache.updatedAt = new Date().toISOString();
    saveJsonAtomic(CACHE_PATH, cache);
    completedBatches += 1;
    console.log(`${type}: cached ${Math.min(offset + batch.length, pending.length)}/${pending.length} pending IDs`);
    if (offset + batch.length < pending.length) await sleep(delayMs);
  }
}

writeEnrichedCsv();
const coverage = Object.fromEntries(['artist', 'album', 'track'].map((type) => [type, {
  cached: Object.keys(cache[type]).length,
  matched: Object.values(cache[type]).filter((entry) => entry.matched).length,
  total: ids[type].length,
}]));
console.log(JSON.stringify({ output: OUTPUT_PATH, rows: rows.length, coverage }, null, 2));

async function queryWikidata(type, spotifyIds) {
  const property = { artist: 'P1902', album: 'P2205', track: 'P2207' }[type];
  const values = spotifyIds.map((id) => `"${id}"`).join(' ');
  const artistFields = type === 'artist' ? `
    OPTIONAL { ?item wdt:P31 ?instance. }
    OPTIONAL { ?item wdt:P740 ?formationPlace.
      OPTIONAL { ?formationPlace wdt:P625 ?formationCoord. }
      OPTIONAL { ?formationPlace wdt:P17 ?formationCountry. }
    }
    OPTIONAL { ?item wdt:P19 ?birthPlace.
      OPTIONAL { ?birthPlace wdt:P625 ?birthCoord. }
      OPTIONAL { ?birthPlace wdt:P17 ?birthCountry. }
    }
    OPTIONAL { ?item wdt:P27 ?citizenship. }
  ` : 'OPTIONAL { ?item wdt:P577 ?publicationDate. }';
  const selectFields = type === 'artist'
    ? '?instance ?instanceLabel ?formationPlace ?formationPlaceLabel ?formationCoord ?formationCountry ?formationCountryLabel ?birthPlace ?birthPlaceLabel ?birthCoord ?birthCountry ?birthCountryLabel ?citizenship ?citizenshipLabel'
    : '?publicationDate';
  const query = `
    SELECT ?spotifyId ?item ?itemLabel ?genre ?genreLabel ${selectFields} WHERE {
      VALUES ?spotifyId { ${values} }
      ?item wdt:${property} ?spotifyId.
      OPTIONAL { ?item wdt:P136 ?genre. }
      ${artistFields}
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithRetry(url);
  const grouped = {};
  for (const binding of payload.results?.bindings ?? []) {
    const id = binding.spotifyId?.value;
    if (!id) continue;
    const record = grouped[id] ??= {
      spotifyId: id,
      matched: true,
      wikidataId: binding.item?.value?.split('/').pop() ?? '',
      label: binding.itemLabel?.value ?? '',
      genres: [],
      publicationDates: [],
      instances: [],
      formationPlaces: [],
      birthPlaces: [],
      countries: [],
    };
    addUnique(record.genres, binding.genreLabel?.value);
    addUnique(record.publicationDates, binding.publicationDate?.value);
    addUnique(record.instances, binding.instanceLabel?.value);
    addPlace(record.formationPlaces, binding.formationPlaceLabel?.value, binding.formationCoord?.value, binding.formationCountryLabel?.value);
    addPlace(record.birthPlaces, binding.birthPlaceLabel?.value, binding.birthCoord?.value, binding.birthCountryLabel?.value);
    addUnique(record.countries, binding.citizenshipLabel?.value);
  }
  return grouped;
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Wikidata request failed: ${response.status} ${await response.text()}`);
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(30000, 1500 * 2 ** attempt));
  }
  throw new Error('Wikidata request failed after retries');
}

function writeEnrichedCsv() {
  const enrichedAt = new Date().toISOString();
  const enrichedRows = rows.map((row) => {
    if (row.data_status === 'unavailable') return { ...row, data_status: 'unavailable' };
    const primaryArtistId = splitMulti(row.spotify_artist_ids)[0];
    const artist = cache.artist[primaryArtistId];
    const album = cache.album[row.spotify_album_id];
    const track = cache.track[row.spotify_track_id];
    const musicbrainzAlbum = musicbrainzCache.albums?.[row.spotify_album_id];
    const wikidataDates = track?.publicationDates?.length ? track.publicationDates : album?.publicationDates ?? [];
    const wikidataDate = earliestDate(wikidataDates);
    const releaseDate = wikidataDate || musicbrainzAlbum?.firstReleaseDate || '';
    const genres = [...new Set([...(track?.genres ?? []), ...(album?.genres ?? []), ...(artist?.genres ?? [])])];
    const classified = classifyGenres(genres);
    const place = artist?.formationPlaces?.[0] ?? artist?.birthPlaces?.[0];
    const point = parsePoint(place?.coordinate);
    const matchedAny = Boolean(artist?.matched || album?.matched || track?.matched || musicbrainzAlbum?.matched);
    return {
      ...row,
      release_date: releaseDate,
      release_year: releaseDate ? releaseDate.slice(0, 4) : '',
      release_date_precision: releaseDate ? (releaseDate.length === 4 ? 'year' : releaseDate.length === 7 ? 'month' : 'day') : '',
      original_release_year: releaseDate ? releaseDate.slice(0, 4) : '',
      release_year_confidence: wikidataDate ? 'high' : musicbrainzAlbum?.matched ? 'medium' : 'low',
      release_year_source: track?.publicationDates?.length ? 'wikidata:P2207/P577' : album?.publicationDates?.length ? 'wikidata:P2205/P577' : musicbrainzAlbum?.matched ? 'musicbrainz:release-group/first-release-date' : '',
      genre_family: classified.family,
      genre_primary: classified.primary,
      genre_secondary: classified.secondary,
      historical_period: classified.historicalPeriod,
      genre_confidence: genres.length ? classified.confidence : 'low',
      genre_source: genres.length ? 'wikidata:P136' : '',
      origin_city: place?.label ?? '',
      origin_region: '',
      origin_country: place?.country ?? artist?.countries?.[0] ?? '',
      origin_latitude: point?.latitude ?? '',
      origin_longitude: point?.longitude ?? '',
      origin_scope: place ? 'artist' : '',
      origin_confidence: place ? 'high' : 'low',
      origin_source: artist?.formationPlaces?.length ? 'wikidata:P1902/P740' : artist?.birthPlaces?.length ? 'wikidata:P1902/P19' : '',
      data_status: matchedAny ? 'enriched' : 'needs_review',
      enriched_at: enrichedAt,
      notes: matchedAny ? '' : 'No exact identifier or high-confidence album match found yet',
    };
  });
  fs.writeFileSync(OUTPUT_PATH, stringify(enrichedRows, { header: true }));
}

function addUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function addPlace(values, label, coordinate, country) {
  if (!label) return;
  const key = `${label}|${coordinate ?? ''}|${country ?? ''}`;
  if (!values.some((value) => value.key === key)) values.push({ key, label, coordinate: coordinate ?? '', country: country ?? '' });
}

function earliestDate(values = []) {
  return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b))[0]?.replace(/^\+/, '').slice(0, 10) ?? '';
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
