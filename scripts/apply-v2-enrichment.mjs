import fs from 'node:fs';
import path from 'node:path';
import { classifyGenres, parsePoint } from './music-taxonomy.mjs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const OUTPUT_PATH = INPUT_PATH;
const WIKIDATA_CACHE_PATH = path.join(ROOT, 'data', 'wikidata-cache.json');
const NAME_CACHE_PATH = path.join(ROOT, 'data', 'wikidata-artist-name-cache.json');
const RECORDING_CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-recording-cache.json');
const MUSICBRAINZ_ALBUM_CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-cache.json');
const MUSICBRAINZ_ARTIST_CACHE_PATH = path.join(ROOT, 'data', 'musicbrainz-artist-cache.json');
const MUSICBRAINZ_AREA_CACHE_PATH = path.join(ROOT, 'data', 'wikidata-musicbrainz-area-cache.json');
const GENRE_OVERRIDE_PATH = path.join(ROOT, 'data', 'genre-overrides.json');

const rows = parse(fs.readFileSync(INPUT_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
const wikidataCache = readJson(WIKIDATA_CACHE_PATH, { artist: {} });
const nameCache = readJson(NAME_CACHE_PATH, { artists: {} });
const recordingCache = readJson(RECORDING_CACHE_PATH, { tracks: {} });
const musicbrainzAlbumCache = readJson(MUSICBRAINZ_ALBUM_CACHE_PATH, { albums: {} });
const musicbrainzArtistCache = readJson(MUSICBRAINZ_ARTIST_CACHE_PATH, { artists: {} });
const musicbrainzAreaCache = readJson(MUSICBRAINZ_AREA_CACHE_PATH, { areas: {} });
const genreOverrideRegistry = readJson(GENRE_OVERRIDE_PATH, { artists: {} });
const genreOverridesByName = new Map(Object.entries(genreOverrideRegistry.artists ?? {}).map(([name, override]) => [normalize(name), { name, ...override }]));
const active = rows.filter((row) => row.spotify_track_id);
const currentYear = new Date().getUTCFullYear();

const classicalPeriods = new Set(['Medieval', 'Renaissance', 'Baroque', 'Classical period', 'Romantic', 'Modern classical']);
const periodYears = {
  Medieval: 1350,
  Renaissance: 1550,
  Baroque: 1725,
  'Classical period': 1785,
  Romantic: 1850,
  'Modern classical': 1920,
};

const sourcedRows = active.filter((row) => validYear(row.release_year) && !isEstimate(row.release_year_source));
const albumYears = groupValues(sourcedRows, (row) => albumKey(row), (row) => Number(row.release_year));
const artistYears = new Map();
for (const row of sourcedRows) {
  for (const artist of splitMulti(row.artist_names)) pushMapValue(artistYears, normalize(artist), Number(row.release_year));
}
const genreYears = groupValues(sourcedRows, (row) => row.genre_family || 'Other', (row) => Number(row.release_year));

// Genre coverage is resolved independently from year/origin coverage. Directly
// sourced rows teach us the artist's catalog-level family; the remaining long
// tail is explicitly marked as inferred or estimated rather than left blank.
const genresByArtistId = new Map();
const genresByArtistName = new Map();
for (const row of active) {
  if (!row.genre_source || !row.genre_family || isEstimate(row.genre_source)) continue;
  const canonical = canonicalGenre(row);
  const evidence = {
    family: canonical.family,
    primary: canonical.primary,
    secondary: canonical.secondary,
    historicalPeriod: canonical.historicalPeriod,
  };
  for (const artistId of splitMulti(row.spotify_artist_ids)) pushMapValue(genresByArtistId, artistId, evidence);
  for (const artistName of splitMulti(row.artist_names)) pushMapValue(genresByArtistName, normalize(artistName), evidence);
}

const exactPlacesByArtistId = new Map();
for (const [artistId, artist] of Object.entries(wikidataCache.artist ?? {})) {
  const place = placeFromWikidataArtist(artist);
  if (place) exactPlacesByArtistId.set(artistId, place);
}
const knownPlacesByArtistName = new Map();
const knownCoordinatesByPlaceName = new Map();
const countryCoordinates = new Map();
for (const row of active) {
  if (!validCoordinate(row.origin_latitude, row.origin_longitude) || isEstimate(row.origin_source)) continue;
  const place = placeFromRow(row);
  for (const artist of splitMulti(row.artist_names)) if (!knownPlacesByArtistName.has(normalize(artist))) knownPlacesByArtistName.set(normalize(artist), place);
  if (row.origin_city) pushMapValue(knownCoordinatesByPlaceName, normalize(row.origin_city), place);
  if (row.origin_country) pushMapValue(countryCoordinates, normalize(row.origin_country), [Number(row.origin_latitude), Number(row.origin_longitude)]);
}
const countryCentroids = new Map([...countryCoordinates].map(([country, points]) => [country, {
  latitude: median(points.map((point) => point[0])),
  longitude: median(points.map((point) => point[1])),
}]));
const genrePlaces = new Map();
for (const row of active) {
  if (!validCoordinate(row.origin_latitude, row.origin_longitude) || isEstimate(row.origin_source)) continue;
  pushMapValue(genrePlaces, row.genre_family || 'Other', placeFromRow(row));
}

const enrichedAt = new Date().toISOString();
const outputRows = rows.map((row) => {
  if (!row.spotify_track_id) return row;
  const artistNames = splitMulti(row.artist_names);
  const artistIds = splitMulti(row.spotify_artist_ids);
  const primaryArtistCandidate = bestArtistCandidate(artistNames[0], artistIds[0]);

  const genre = resolveGenre(row, artistNames, artistIds);
  const release = resolveRelease(row, artistNames, primaryArtistCandidate);
  const genreRow = { ...row, genre_family: genre.family, historical_period: genre.historicalPeriod };
  const timeline = resolveTimeline(genreRow, release, primaryArtistCandidate);
  const origin = resolveOrigin(genreRow, artistNames, artistIds);
  const estimated = genre.estimated || timeline.kind.startsWith('estimated') || isEstimate(release.source) || isEstimate(origin.source);
  const estimateNote = 'V2: estimated fields are explicitly marked by source and confidence';
  const notes = [row.notes, estimated && !row.notes.includes(estimateNote) ? estimateNote : ''].filter(Boolean).join('; ');

  const nextRow = {
    ...row,
    genre_family: genre.family,
    genre_primary: genre.primary,
    genre_secondary: genre.secondary,
    historical_period: genre.historicalPeriod,
    genre_confidence: genre.confidence,
    genre_source: genre.source,
    genre_evidence: genre.evidence || genre.source,
    genre_estimated: String(genre.estimated),
    release_date: release.date,
    release_year: String(release.year),
    release_date_precision: release.precision,
    original_release_year: String(release.year),
    release_year_confidence: release.confidence,
    release_year_source: release.source,
    release_year_estimated: String(isEstimate(release.source)),
    timeline_year: String(timeline.year),
    timeline_year_kind: timeline.kind,
    timeline_year_confidence: timeline.confidence,
    timeline_year_source: timeline.source,
    origin_city: origin.city,
    origin_region: origin.region,
    origin_country: origin.country,
    origin_latitude: String(origin.latitude),
    origin_longitude: String(origin.longitude),
    origin_scope: origin.scope,
    origin_confidence: origin.confidence,
    origin_source: origin.source,
    origin_estimated: String(isEstimate(origin.source)),
    data_status: estimated ? 'reviewed' : row.data_status,
    enriched_at: row.enriched_at,
    notes,
  };
  const changed = Object.entries(nextRow).some(([key, value]) => key !== 'enriched_at' && String(value ?? '') !== String(row[key] ?? ''));
  return { ...nextRow, enriched_at: changed ? enrichedAt : row.enriched_at };
});

fs.writeFileSync(OUTPUT_PATH, stringify(outputRows, { header: true }));
fs.copyFileSync(OUTPUT_PATH, path.join(ROOT, 'public', 'songs-for-self-v2.csv'));
fs.copyFileSync(OUTPUT_PATH, path.join(ROOT, 'public', 'songs-for-self-v3.csv'));
const outputActive = outputRows.filter((row) => row.spotify_track_id);
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  activeTracks: outputActive.length,
  datedTracks: outputActive.filter((row) => validYear(row.release_year)).length,
  estimatedReleaseYears: outputActive.filter((row) => row.release_year_estimated === 'true').length,
  compositionEraTracks: outputActive.filter((row) => row.timeline_year_kind === 'estimated_composition').length,
  timelineTracks: outputActive.filter((row) => validYear(row.timeline_year)).length,
  mappedTracks: outputActive.filter((row) => validCoordinate(row.origin_latitude, row.origin_longitude)).length,
  estimatedOrigins: outputActive.filter((row) => row.origin_estimated === 'true').length,
  classifiedGenreTracks: outputActive.filter((row) => row.genre_family && row.genre_source).length,
  estimatedGenreTracks: outputActive.filter((row) => row.genre_estimated === 'true').length,
}, null, 2));

function resolveGenre(row, artistNames, artistIds) {
  const override = artistNames.map((name) => genreOverridesByName.get(normalize(name))).find(Boolean);
  if (override) return {
    family: override.family,
    primary: override.primary || override.family,
    secondary: override.secondary || '',
    historicalPeriod: override.historicalPeriod || row.historical_period || '',
    confidence: override.confidence || 'high',
    source: `editorial:genre-overrides/${normalize(override.name).replace(/ /g, '-')}`,
    evidence: (override.evidence ?? []).join('; '),
    estimated: false,
  };

  if (row.genre_source && row.genre_family && !isEstimate(row.genre_source)) {
    const canonical = canonicalGenre(row);
    return {
    family: canonical.family,
    primary: canonical.primary,
    secondary: canonical.secondary,
    historicalPeriod: canonical.historicalPeriod,
    confidence: canonical.confidence === 'low' ? row.genre_confidence || 'low' : canonical.confidence,
    source: row.genre_source,
    estimated: isEstimate(row.genre_source),
    };
  }

  const idEvidence = artistIds.flatMap((artistId) => genresByArtistId.get(artistId) ?? []);
  const nameEvidence = artistNames.flatMap((artistName) => genresByArtistName.get(normalize(artistName)) ?? []);
  const artistEvidence = idEvidence.length ? idEvidence : nameEvidence;
  if (artistEvidence.length) {
    const winningFamily = textMode(artistEvidence.map((item) => item.family)) || 'Other';
    const matching = artistEvidence.filter((item) => item.family === winningFamily);
    return {
      family: winningFamily,
      primary: textMode(matching.map((item) => item.primary).filter(Boolean)) || winningFamily,
      secondary: textMode(matching.map((item) => item.secondary).filter(Boolean)) || '',
      historicalPeriod: textMode(matching.map((item) => item.historicalPeriod).filter(Boolean)) || '',
      confidence: idEvidence.length ? 'medium' : 'low',
      source: idEvidence.length ? 'inferred:playlist-spotify-artist-catalog' : 'inferred:playlist-artist-name-catalog',
      estimated: true,
    };
  }

  const metadata = classifyGenres([row.historical_period, row.genre_primary, row.genre_secondary, row.album_name, row.track_name, row.artist_names]);
  if (metadata.family !== 'Other') return {
    family: metadata.family,
    primary: metadata.primary || metadata.family,
    secondary: metadata.secondary,
    historicalPeriod: metadata.historicalPeriod || row.historical_period || '',
    confidence: 'low',
    source: 'estimate:track-album-artist-keywords',
    estimated: true,
  };

  if (row.genre_family && row.genre_family !== 'Other') return {
    family: row.genre_family,
    primary: row.genre_primary || row.genre_family,
    secondary: row.genre_secondary || '',
    historicalPeriod: row.historical_period || '',
    confidence: 'low',
    source: 'estimate:existing-genre-family',
    estimated: true,
  };

  return {
    family: 'Other',
    primary: 'other / insufficient evidence',
    secondary: '',
    historicalPeriod: row.historical_period || '',
    confidence: 'low',
    source: 'estimate:other-insufficient-evidence',
    estimated: true,
  };
}

function canonicalGenre(row) {
  const labels = [row.genre_primary, ...splitMulti(row.genre_secondary), row.historical_period].filter(Boolean);
  const classified = classifyGenres(labels);
  if (classified.family !== 'Other') return {
    family: classified.family,
    primary: row.genre_primary || classified.primary || classified.family,
    secondary: row.genre_secondary || classified.secondary,
    historicalPeriod: classified.historicalPeriod || row.historical_period || '',
    confidence: classified.confidence,
  };
  const legacy = {
    'Hip-hop & R&B': 'Hip-hop',
  }[row.genre_family] ?? row.genre_family ?? 'Other';
  return {
    family: legacy,
    primary: row.genre_primary || legacy,
    secondary: row.genre_secondary || '',
    historicalPeriod: row.historical_period || '',
    confidence: row.genre_confidence || 'low',
  };
}

function resolveRelease(row, artistNames, artistCandidate) {
  if (validYear(row.release_year) && !isEstimate(row.release_year_source)) {
    return {
      date: row.release_date || row.release_year,
      year: Number(row.release_year),
      precision: row.release_date_precision || 'year',
      confidence: row.release_year_confidence || 'medium',
      source: row.release_year_source,
    };
  }
  const recording = recordingCache.tracks?.[row.spotify_track_id];
  if (recording?.matched && validYear(String(recording.firstReleaseDate).slice(0, 4))) {
    return {
      date: recording.firstReleaseDate,
      year: Number(String(recording.firstReleaseDate).slice(0, 4)),
      precision: recording.firstReleaseDate.length >= 10 ? 'day' : recording.firstReleaseDate.length >= 7 ? 'month' : 'year',
      confidence: 'medium',
      source: 'musicbrainz:recording/first-release-date',
    };
  }
  const musicbrainzAlbum = musicbrainzAlbumCache.albums?.[row.spotify_album_id];
  if (musicbrainzAlbum?.matched && validYear(String(musicbrainzAlbum.firstReleaseDate).slice(0, 4))) {
    return {
      date: musicbrainzAlbum.firstReleaseDate,
      year: Number(String(musicbrainzAlbum.firstReleaseDate).slice(0, 4)),
      precision: musicbrainzAlbum.firstReleaseDate.length >= 10 ? 'day' : musicbrainzAlbum.firstReleaseDate.length >= 7 ? 'month' : 'year',
      confidence: 'medium',
      source: 'musicbrainz:release-group/first-release-date',
    };
  }
  const albumMatches = albumYears.get(albumKey(row));
  if (albumMatches?.length) return estimatedRelease(mode(albumMatches), 'medium', 'inferred:playlist-album-title-and-artist');
  const catalogYears = artistNames.flatMap((artist) => artistYears.get(normalize(artist)) ?? []);
  if (catalogYears.length) return estimatedRelease(median(catalogYears), 'low', 'estimate:playlist-artist-catalog-median');
  const activeYear = estimateActiveYear(artistCandidate);
  if (activeYear) return estimatedRelease(activeYear, 'low', 'estimate:wikidata-artist-active-period');
  const genreMedian = median(genreYears.get(row.genre_family || 'Other') ?? sourcedRows.map((item) => Number(item.release_year)));
  return estimatedRelease(genreMedian || 2000, 'low', 'estimate:genre-catalog-median');
}

function resolveTimeline(row, release, artistCandidate) {
  if (row.genre_family === 'Classical' || classicalPeriods.has(row.historical_period) || isHistoricalComposer(artistCandidate)) {
    const compositionYear = estimateCompositionYear(artistCandidate, row.historical_period);
    return {
      year: compositionYear,
      kind: 'estimated_composition',
      confidence: artistCandidate ? 'medium' : 'low',
      source: artistCandidate ? 'estimate:wikidata-composer-active-period' : `estimate:musical-period/${row.historical_period || 'classical'}`,
    };
  }
  return {
    year: release.year,
    kind: isEstimate(release.source) || release.source.startsWith('inferred:') ? 'estimated_release' : 'sourced_release',
    confidence: release.confidence,
    source: release.source,
  };
}

function resolveOrigin(row, artistNames, artistIds) {
  if (validCoordinate(row.origin_latitude, row.origin_longitude) && !isEstimate(row.origin_source)) return placeFromRow(row);

  for (const artistId of artistIds) {
    const place = exactPlacesByArtistId.get(artistId);
    if (place) return { ...place, confidence: 'high', source: 'wikidata:spotify-artist-id/place', scope: 'artist' };
  }
  for (const artistName of artistNames) {
    const place = knownPlacesByArtistName.get(normalize(artistName));
    if (place) return { ...place, confidence: 'medium', source: 'inferred:playlist-artist-name/place', scope: 'artist' };
  }
  for (const artistName of artistNames) {
    const candidate = bestArtistCandidate(artistName, artistIds[artistNames.indexOf(artistName)]);
    const place = placeFromNameCandidate(candidate);
    if (place) return { ...place, confidence: 'medium', source: 'wikidata:exact-artist-name/place', scope: 'artist' };
    const country = candidate?.countries?.[0];
    const centroid = countryCentroids.get(normalize(country));
    if (country && centroid) return {
      city: '', region: '', country, ...centroid,
      confidence: 'low', source: 'estimate:wikidata-citizenship/country-centroid', scope: 'artist',
    };
  }
  for (const artistName of artistNames) {
    const artist = musicbrainzArtistCache.artists?.[artistName];
    if (!artist?.matched) continue;
    const exactArea = musicbrainzAreaCache.areas?.[artist.beginAreaId]?.coordinate
      ? musicbrainzAreaCache.areas[artist.beginAreaId]
      : musicbrainzAreaCache.areas?.[artist.areaId]?.coordinate ? musicbrainzAreaCache.areas[artist.areaId] : null;
    const exactPoint = parsePoint(exactArea?.coordinate);
    if (exactPoint) return {
      city: artist.beginAreaId === exactArea.musicbrainzAreaId ? artist.beginArea : '',
      region: artist.beginAreaId === exactArea.musicbrainzAreaId ? artist.area : '',
      country: exactArea.country || countryName(artist.country) || artist.area,
      latitude: exactPoint.latitude,
      longitude: exactPoint.longitude,
      confidence: 'medium', source: 'musicbrainz:artist-area+wikidata:P982/P625', scope: 'artist',
    };
    const areaName = artist.beginArea || artist.area;
    const knownArea = knownCoordinatesByPlaceName.get(normalize(areaName))?.[0];
    if (knownArea) return {
      ...knownArea,
      confidence: 'medium', source: 'musicbrainz:artist-area/playlist-place-match', scope: 'artist',
    };
    const country = countryName(artist.country) || artist.area;
    const centroid = countryCentroids.get(normalize(country));
    if (country && centroid) return {
      city: '', region: areaName && normalize(areaName) !== normalize(country) ? areaName : '', country, ...centroid,
      confidence: 'low', source: 'estimate:musicbrainz-artist-area/country-centroid', scope: 'artist',
    };
  }

  const genreCandidates = genrePlaces.get(row.genre_family || 'Other') ?? [...genrePlaces.values()].flat();
  const fallback = modalCountryPlace(genreCandidates);
  return {
    ...fallback,
    city: '',
    confidence: 'low',
    source: `estimate:genre-country-mode/${row.genre_family || 'Other'}`,
    scope: 'artist',
  };
}

function estimatedRelease(year, confidence, source) {
  const rounded = Math.max(1200, Math.min(currentYear, Math.round(Number(year) || 2000)));
  return { date: String(rounded), year: rounded, precision: 'estimated-year', confidence, source };
}

function estimateCompositionYear(candidate, historicalPeriod) {
  const birthYear = firstYear(candidate?.birthDates);
  const deathYear = firstYear(candidate?.deathDates);
  const inceptionYear = firstYear(candidate?.inceptionDates);
  if (birthYear) return Math.max(1200, Math.min(deathYear ? deathYear - 1 : currentYear, birthYear + 35));
  if (inceptionYear) return Math.max(1200, Math.min(currentYear, inceptionYear + 5));
  return periodYears[historicalPeriod] ?? 1900;
}

function estimateActiveYear(candidate) {
  const birthYear = firstYear(candidate?.birthDates);
  const deathYear = firstYear(candidate?.deathDates);
  const inceptionYear = firstYear(candidate?.inceptionDates);
  const dissolvedYear = firstYear(candidate?.dissolvedDates);
  if (birthYear) return Math.min(deathYear ? deathYear - 1 : currentYear, birthYear + 30);
  if (inceptionYear) return Math.min(dissolvedYear ? dissolvedYear - 1 : currentYear, inceptionYear + 5);
  return null;
}

function bestArtistCandidate(name, spotifyArtistId = '') {
  const candidates = nameCache.artists?.[name]?.candidates ?? [];
  const exactProfile = wikidataCache.artist?.[spotifyArtistId];
  const exactWikidataId = exactProfile?.wikidataId;
  const musicbrainzCandidate = musicbrainzProfile(name);
  if (exactWikidataId) {
    const exact = candidates.find((candidate) => candidate.wikidataId === exactWikidataId);
    if (exact) {
      const merged = mergeArtistProfiles(exact, exactProfile);
      return musicbrainzCandidate ? mergeArtistProfiles(merged, musicbrainzCandidate) : merged;
    }
    if (exactProfile.profileEnriched) return musicbrainzCandidate ? mergeArtistProfiles(exactProfile, musicbrainzCandidate) : exactProfile;
  }
  const nameCandidate = candidates.find(isMusicalCandidate) ?? candidates.find((candidate) => candidate.formationPlaces?.length || candidate.birthPlaces?.length || candidate.birthDates?.length || candidate.inceptionDates?.length) ?? null;
  if (nameCandidate && musicbrainzCandidate) return mergeArtistProfiles(nameCandidate, musicbrainzCandidate);
  return nameCandidate ?? musicbrainzCandidate;
}

function mergeArtistProfiles(nameCandidate, exactProfile) {
  return {
    ...nameCandidate,
    ...exactProfile,
    occupations: [...new Set([...(nameCandidate.occupations ?? []), ...(exactProfile.occupations ?? [])])],
    birthDates: [...new Set([...(nameCandidate.birthDates ?? []), ...(exactProfile.birthDates ?? [])])],
    deathDates: [...new Set([...(nameCandidate.deathDates ?? []), ...(exactProfile.deathDates ?? [])])],
    inceptionDates: [...new Set([...(nameCandidate.inceptionDates ?? []), ...(exactProfile.inceptionDates ?? [])])],
    dissolvedDates: [...new Set([...(nameCandidate.dissolvedDates ?? []), ...(exactProfile.dissolvedDates ?? [])])],
  };
}

function musicbrainzProfile(name) {
  const artist = musicbrainzArtistCache.artists?.[name];
  if (!artist?.matched) return null;
  const person = artist.type === 'Person';
  return {
    wikidataId: '',
    occupations: person ? ['musician'] : ['musical group'],
    instances: [artist.type ?? ''],
    birthDates: person && artist.beginDate ? [artist.beginDate] : [],
    deathDates: person && artist.endDate ? [artist.endDate] : [],
    inceptionDates: !person && artist.beginDate ? [artist.beginDate] : [],
    dissolvedDates: !person && artist.endDate ? [artist.endDate] : [],
    formationPlaces: [],
    birthPlaces: [],
    countries: [countryName(artist.country) || artist.area].filter(Boolean),
  };
}

function isMusicalCandidate(candidate) {
  const labels = [...(candidate.occupations ?? []), ...(candidate.instances ?? [])].join(' ').toLowerCase();
  return /music|singer|rapper|composer|pianist|guitarist|drummer|conductor|orchestra|band|choir|disc jockey|songwriter|record producer|instrumentalist/.test(labels);
}

function isHistoricalComposer(candidate) {
  const birthYear = firstYear(candidate?.birthDates);
  return Boolean(birthYear && birthYear < 1900 && candidate?.occupations?.some((occupation) => occupation.toLowerCase().includes('composer')));
}

function placeFromWikidataArtist(artist) {
  const place = artist?.formationPlaces?.find((item) => parsePoint(item.coordinate)) ?? artist?.birthPlaces?.find((item) => parsePoint(item.coordinate));
  const point = parsePoint(place?.coordinate);
  if (!point) return null;
  return { city: place.label ?? '', region: '', country: place.country ?? artist.countries?.[0] ?? '', latitude: point.latitude, longitude: point.longitude };
}

function placeFromNameCandidate(candidate) {
  if (!candidate) return null;
  const place = candidate.formationPlaces?.find((item) => parsePoint(item.coordinate)) ?? candidate.birthPlaces?.find((item) => parsePoint(item.coordinate));
  const point = parsePoint(place?.coordinate);
  if (!point) return null;
  return { city: place.label ?? '', region: '', country: place.country ?? candidate.countries?.[0] ?? '', latitude: point.latitude, longitude: point.longitude };
}

function placeFromRow(row) {
  return {
    city: row.origin_city ?? '', region: row.origin_region ?? '', country: row.origin_country ?? '',
    latitude: Number(row.origin_latitude), longitude: Number(row.origin_longitude),
    scope: row.origin_scope || 'artist', confidence: row.origin_confidence || 'medium', source: row.origin_source || 'existing',
  };
}

function modalCountryPlace(places) {
  if (!places.length) return { country: 'Unknown', latitude: 20, longitude: 0, region: '' };
  const counts = new Map();
  for (const place of places) if (place.country) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  const country = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? places[0].country ?? 'Unknown';
  const matching = places.filter((place) => place.country === country);
  return {
    country,
    region: '',
    latitude: median(matching.map((place) => Number(place.latitude))),
    longitude: median(matching.map((place) => Number(place.longitude))),
  };
}

function albumKey(row) {
  return `${normalizeAlbum(row.album_name)}|${normalize(splitMulti(row.artist_names)[0] ?? '')}`;
}

function normalizeAlbum(value) {
  return normalize(value)
    .replace(/\b(deluxe|remaster(?:ed)?|expanded|anniversary|edition|version|original motion picture soundtrack|bonus track)\b.*$/i, '')
    .trim();
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function groupValues(items, keyFunction, valueFunction) {
  const result = new Map();
  for (const item of items) pushMapValue(result, keyFunction(item), valueFunction(item));
  return result;
}

function pushMapValue(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function mode(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;
}

function textMode(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]?.[0] ?? '';
}

function firstYear(values = []) {
  const year = Number(String(values[0] ?? '').replace(/^\+/, '').slice(0, 4));
  return validYear(year) ? year : null;
}

function validYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1000 && year <= currentYear;
}

function validCoordinate(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && String(latitude) !== '' && String(longitude) !== '';
}

function isEstimate(source = '') {
  return source.startsWith('estimate:') || source.startsWith('inferred:');
}

function splitMulti(value = '') {
  return value ? value.split('; ').filter(Boolean) : [];
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function countryName(code) {
  if (!code || code.length !== 2) return '';
  return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? '';
}
