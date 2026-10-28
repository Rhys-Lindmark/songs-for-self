import fs from 'node:fs';
import path from 'node:path';
import { geoEquirectangular } from 'd3-geo';
import { parse } from 'csv-parse/sync';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json' with { type: 'json' };

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true })
  .filter((row) => row.spotify_track_id);
const countries = feature(world, world.objects.countries);
const projection = geoEquirectangular().fitExtent([[8, 8], [992, 492]], countries);

const tracks = rows.map((row) => {
  const longitude = Number(row.origin_longitude);
  const latitude = Number(row.origin_latitude);
  const point = Number.isFinite(longitude) && Number.isFinite(latitude) ? projection([longitude, latitude]) : null;
  return {
    id: row.spotify_track_id,
    key: trackKey(row.track_name, row.artist_names),
    track: row.track_name,
    artist: row.artist_names,
    year: Number(row.timeline_year || row.release_year) || null,
    genre: row.genre_family || 'Other',
    genreEstimated: row.genre_estimated === 'true',
    x: point?.[0] ?? null,
    y: point?.[1] ?? null,
    city: row.origin_city || '',
    country: row.origin_country || '',
    countryId: row.origin_country_id || '',
    regionId: row.origin_region_id || '',
    cityId: row.origin_city_id || '',
    genreSource: row.genre_source || '',
    genreConfidence: row.genre_confidence || 'low',
    timeSource: row.timeline_year_source || row.release_date_source || '',
    timeConfidence: row.timeline_year_confidence || row.release_date_confidence || 'low',
    geographySource: row.origin_source || '',
    geographyConfidence: row.origin_confidence || 'low',
  };
});

const artistBuckets = new Map();
for (const track of tracks) {
  for (const artist of track.artist.split('; ').filter(Boolean)) {
    const key = normalize(artist);
    const bucket = artistBuckets.get(key) ?? { name: artist, genres: [], years: [], places: [] };
    bucket.genres.push(track.genre);
    if (track.year) bucket.years.push(track.year);
    if (track.x !== null && track.y !== null) bucket.places.push(track);
    artistBuckets.set(key, bucket);
  }
}
const artists = [...artistBuckets].map(([key, bucket]) => {
  const place = mode(bucket.places.map((item) => `${item.x}|${item.y}|${item.city}|${item.country}`));
  const [x, y, city = '', country = ''] = place ? place.split('|') : [];
  return {
    key,
    name: bucket.name,
    genre: mode(bucket.genres) || 'Other',
    year: median(bucket.years),
    x: x === undefined ? null : Number(x),
    y: y === undefined ? null : Number(y),
    city,
    country,
  };
});

const output = { version: 1, generatedAt: new Date().toISOString(), tracks, artists };
fs.writeFileSync(path.join(root, 'public', 'upload-lookup.json'), `${JSON.stringify(output)}\n`);
fs.writeFileSync(path.join(root, 'public', 'playlist-upload-template.csv'), 'Track Name,Artist Name,Album Name,Release Date,Genre,Spotify Track ID,Country,Latitude,Longitude\nExample Song,Example Artist,Example Album,1999,rock,,,,\n');
console.log(JSON.stringify({ tracks: tracks.length, artists: artists.length }));

function normalize(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function trackKey(track, artist) {
  return `${normalize(track)}|${normalize(String(artist).split('; ')[0])}`;
}

function mode(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]?.[0] ?? '';
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
}
