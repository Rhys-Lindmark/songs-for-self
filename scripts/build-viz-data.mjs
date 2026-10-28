import fs from 'node:fs';
import path from 'node:path';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { parse } from 'csv-parse/sync';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json' with { type: 'json' };

const ROOT = process.cwd();
const inputPath = path.join(ROOT, 'data', 'songs-for-self.enriched.csv');
const outputPath = path.join(ROOT, 'data', 'viz-data.json');
const summaryOutputPath = path.join(ROOT, 'data', 'viz-summary.json');
const timelineOutputPath = path.join(ROOT, 'public', 'timeline-data.json');
const geographyOutputPath = path.join(ROOT, 'public', 'geography-data.json');
const worldOutlineOutputPath = path.join(ROOT, 'public', 'world-outline.json');
const musicBrainzAlbumCachePath = path.join(ROOT, 'data', 'musicbrainz-cache.json');
const artistImageCachePath = path.join(ROOT, 'data', 'wikidata-artist-image-cache.json');
const rows = parse(fs.readFileSync(inputPath, 'utf8'), { columns: true, skip_empty_lines: true });
const active = rows.filter((row) => row.spotify_track_id);
const musicBrainzAlbums = JSON.parse(fs.readFileSync(musicBrainzAlbumCachePath, 'utf8')).albums;
const artistImages = fs.existsSync(artistImageCachePath) ? JSON.parse(fs.readFileSync(artistImageCachePath, 'utf8')).artists : {};
const genreOrder = ['Classical', 'Experimental', 'Country', 'Electronic', 'Modern Folk', 'Hip-hop', 'Jazz', 'Pop', 'R&B, Soul & Blues', 'Rock', 'World', 'Traditional Folk', 'Other'];

const timelineMap = new Map();
const timelineAlbumMaps = new Map();
for (const row of active) {
  const genre = genreOrder.includes(row.genre_family) ? row.genre_family : 'Other';
  const year = Number(row.timeline_year || row.release_year);
  if (Number.isInteger(year) && year >= 1200 && year <= 2026) {
    const key = `${genre}|${year}`;
    const point = timelineMap.get(key) ?? { genre, year, count: 0, sourcedCount: 0, estimatedCount: 0, compositionCount: 0, tracks: [] };
    point.count += 1;
    if (row.timeline_year_kind === 'sourced_release') point.sourcedCount += 1;
    else point.estimatedCount += 1;
    if (row.timeline_year_kind?.includes('composition')) point.compositionCount += 1;
    if (point.tracks.length < 4) point.tracks.push(`${row.track_name} — ${row.artist_names}`);
    if (row.album_name) {
      const albumMap = timelineAlbumMaps.get(key) ?? new Map();
      const albumKey = row.spotify_album_id || `${row.album_name}|${row.artist_names}`;
      const cachedAlbum = row.spotify_album_id ? musicBrainzAlbums[row.spotify_album_id] : null;
      const album = albumMap.get(albumKey) ?? {
        name: row.album_name,
        artists: row.artist_names,
        count: 0,
        spotifyAlbumId: row.spotify_album_id || null,
        coverUrl: cachedAlbum?.matched && cachedAlbum.musicbrainzReleaseGroupId
          ? `https://coverartarchive.org/release-group/${cachedAlbum.musicbrainzReleaseGroupId}/front-250`
          : null,
        coverSource: cachedAlbum?.matched && cachedAlbum.musicbrainzReleaseGroupId ? 'Cover Art Archive' : null,
        coverSourceId: cachedAlbum?.musicbrainzReleaseGroupId ?? null,
      };
      album.count += 1;
      albumMap.set(albumKey, album);
      timelineAlbumMaps.set(key, albumMap);
    }
    timelineMap.set(key, point);
  }
}

for (const [key, point] of timelineMap) {
  point.albums = [...(timelineAlbumMaps.get(key)?.values() ?? [])]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 4);
}

const countries = feature(world, world.objects.countries);
const projection = geoEquirectangular().fitExtent([[8, 8], [992, 492]], countries);
const worldPath = geoPath(projection)(countries) ?? '';
const placeMap = new Map();
for (const row of active) {
  const latitude = Number(row.origin_latitude);
  const longitude = Number(row.origin_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  const projected = projection([longitude, latitude]);
  if (!projected) continue;
  const key = `${latitude.toFixed(5)}|${longitude.toFixed(5)}|${row.origin_city}|${row.origin_country}`;
  const place = placeMap.get(key) ?? {
    city: row.origin_city,
    country: row.origin_country,
    latitude,
    longitude,
    x: projected[0],
    y: projected[1],
    count: 0,
    sourcedCount: 0,
    estimatedCount: 0,
    years: {},
    artists: [],
    tracks: [],
  };
  place.count += 1;
  if (row.origin_estimated === 'true') place.estimatedCount += 1;
  else place.sourcedCount += 1;
  const year = Number(row.timeline_year || row.release_year);
  if (Number.isInteger(year)) place.years[year] = (place.years[year] ?? 0) + 1;
  for (const artist of row.artist_names.split('; ')) if (artist && place.artists.length < 5 && !place.artists.includes(artist)) place.artists.push(artist);
  if (place.tracks.length < 4) place.tracks.push(row.track_name);
  placeMap.set(key, place);
}

const countryMap = new Map();
for (const row of active) {
  const latitude = Number(row.origin_latitude);
  const longitude = Number(row.origin_longitude);
  const countryId = row.origin_country_id;
  if (!countryId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  const country = countryMap.get(countryId) ?? geographicBucket({
    id: countryId,
    label: row.origin_country,
    unit: 'country',
    country: row.origin_country,
    countryId,
  });
  addGeographicRow(country, row, latitude, longitude);
  if (row.origin_country === 'United States' && row.origin_region_id) {
    const region = childBucket(country, {
      id: row.origin_region_id,
      label: row.origin_region,
      unit: 'region',
      country: row.origin_country,
      countryId,
      region: row.origin_region,
      regionId: row.origin_region_id,
    });
    addGeographicRow(region, row, latitude, longitude);
    if (row.origin_city_id) {
      const city = childBucket(region, {
        id: row.origin_city_id,
        label: row.origin_city,
        unit: 'city',
        country: row.origin_country,
        countryId,
        region: row.origin_region,
        regionId: row.origin_region_id,
      });
      addGeographicRow(city, row, latitude, longitude);
    }
  } else {
    const childId = row.origin_city_id || row.origin_region_id;
    const unit = childId?.startsWith('region:') ? 'region' : 'city';
    const child = childId ? childBucket(country, {
      id: childId,
      label: unit === 'region' ? row.origin_region : row.origin_city,
      unit,
      country: row.origin_country,
      countryId,
      region: row.origin_region,
      regionId: row.origin_region_id,
    }) : childBucket(country, {
      id: `${countryId}/local-origin-unresolved`,
      label: row.origin_country === 'United States' ? 'State not yet known' : 'Local origin not yet known',
      unit: 'remainder',
      country: row.origin_country,
      countryId,
    });
    addGeographicRow(child, row, latitude, longitude);
  }
  countryMap.set(countryId, country);
}

const geographyCountries = [...countryMap.values()].map(finalizeGeographicBucket).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

const years = [...timelineMap.values()].map((point) => point.year);
const genreCounts = Object.fromEntries(genreOrder.map((genre) => [genre, active.filter((row) => (row.genre_family || 'Other') === genre).length]));
const historicalPeriods = Object.entries(
  active.reduce((counts, row) => {
    if (row.historical_period) counts[row.historical_period] = (counts[row.historical_period] ?? 0) + 1;
    return counts;
  }, {}),
).sort((a, b) => b[1] - a[1]).map(([period, count]) => ({ period, count }));

const output = {
  generatedAt: new Date().toISOString(),
  summary: {
    playlistRows: rows.length,
    activeTracks: active.length,
    unavailableTracks: rows.length - active.length,
    enrichedTracks: active.filter((row) => row.data_status === 'enriched').length,
    datedTracks: active.filter((row) => row.release_year).length,
    sourcedReleaseTracks: active.filter((row) => row.release_year && row.release_year_estimated !== 'true').length,
    estimatedReleaseTracks: active.filter((row) => row.release_year_estimated === 'true').length,
    timelineTracks: active.filter((row) => row.timeline_year).length,
    genreTracks: active.filter((row) => row.genre_family && row.genre_source).length,
    sourcedGenreTracks: active.filter((row) => row.genre_family && row.genre_source && row.genre_estimated !== 'true').length,
    estimatedGenreTracks: active.filter((row) => row.genre_estimated === 'true').length,
    mappedTracks: active.filter((row) => row.origin_latitude && row.origin_longitude).length,
    sourcedMappedTracks: active.filter((row) => row.origin_latitude && row.origin_longitude && row.origin_estimated !== 'true').length,
    estimatedMappedTracks: active.filter((row) => row.origin_estimated === 'true').length,
    yearMin: years.length ? Math.min(...years) : null,
    yearMax: years.length ? Math.max(...years) : null,
    genreCounts,
  },
  timeline: [...timelineMap.values()].sort((a, b) => genreOrder.indexOf(a.genre) - genreOrder.indexOf(b.genre) || a.year - b.year),
  periodTimeline: [],
  historicalPeriods,
  places: [...placeMap.values()].sort((a, b) => b.count - a.count),
  geography: {
    countries: geographyCountries,
  },
  worldPath,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
fs.writeFileSync(summaryOutputPath, `${JSON.stringify(output.summary)}\n`);
fs.writeFileSync(timelineOutputPath, `${JSON.stringify({ timeline: output.timeline, historicalPeriods: output.historicalPeriods })}\n`);
fs.writeFileSync(geographyOutputPath, `${JSON.stringify({ worldPath: output.worldPath, placeCount: output.places.length, countries: output.geography.countries })}\n`);
fs.writeFileSync(worldOutlineOutputPath, `${JSON.stringify({ worldPath: output.worldPath })}\n`);
console.log(JSON.stringify({
  output: outputPath,
  browserArtifacts: [timelineOutputPath, geographyOutputPath, worldOutlineOutputPath],
  timelinePoints: output.timeline.length,
  places: output.places.length,
  summary: output.summary,
}, null, 2));

function geographicBucket(fields) {
  return {
    ...fields,
    count: 0,
    sourcedCount: 0,
    estimatedCount: 0,
    years: {},
    artists: [],
    artistCountMap: new Map(),
    tracks: [],
    latitudeTotal: 0,
    longitudeTotal: 0,
    childMap: new Map(),
  };
}

function childBucket(parent, fields) {
  const child = parent.childMap.get(fields.id) ?? geographicBucket(fields);
  parent.childMap.set(fields.id, child);
  return child;
}

function addGeographicRow(bucket, row, latitude, longitude) {
  bucket.count += 1;
  bucket.latitudeTotal += latitude;
  bucket.longitudeTotal += longitude;
  if (row.origin_estimated === 'true') bucket.estimatedCount += 1;
  else bucket.sourcedCount += 1;
  const year = Number(row.timeline_year || row.release_year);
  if (Number.isInteger(year)) bucket.years[year] = (bucket.years[year] ?? 0) + 1;
  const primaryArtist = row.artist_names.split('; ')[0]?.trim();
  const primaryArtistId = row.spotify_artist_ids.split('; ')[0]?.trim();
  if (primaryArtist) {
    const artistKey = primaryArtistId || `name:${primaryArtist.toLowerCase()}`;
    const artist = bucket.artistCountMap.get(artistKey) ?? { id: primaryArtistId || null, name: primaryArtist, count: 0 };
    artist.count += 1;
    bucket.artistCountMap.set(artistKey, artist);
  }
  if (bucket.tracks.length < 4) bucket.tracks.push(row.track_name);
}

function finalizeGeographicBucket(bucket) {
  const latitude = bucket.latitudeTotal / bucket.count;
  const longitude = bucket.longitudeTotal / bucket.count;
  const projected = projection([longitude, latitude]);
  const children = [...bucket.childMap.values()].map(finalizeGeographicBucket).sort((left, right) => Number(left.unit === 'remainder') - Number(right.unit === 'remainder') || right.count - left.count || left.label.localeCompare(right.label));
  const rankedArtists = [...bucket.artistCountMap.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 8);
  const topArtists = rankedArtists.slice(0, 4)
    .map((artist) => {
      const image = artist.id ? artistImages[artist.id] : null;
      return {
        ...artist,
        spotifyUrl: artist.id ? `https://open.spotify.com/artist/${artist.id}` : null,
        imageUrl: image?.matched ? image.imageUrl : null,
        imageSourceUrl: image?.matched ? image.imageSourceUrl : null,
        imageSource: image?.matched ? 'Wikimedia Commons' : null,
      };
    });
  return {
    id: bucket.id,
    label: bucket.label,
    unit: bucket.unit,
    country: bucket.country,
    countryId: bucket.countryId,
    region: bucket.region || '',
    regionId: bucket.regionId || '',
    latitude,
    longitude,
    x: projected?.[0] ?? null,
    y: projected?.[1] ?? null,
    count: bucket.count,
    sourcedCount: bucket.sourcedCount,
    estimatedCount: bucket.estimatedCount,
    years: bucket.years,
    artists: rankedArtists.map((artist) => artist.name),
    topArtists,
    tracks: bucket.tracks,
    children,
  };
}
