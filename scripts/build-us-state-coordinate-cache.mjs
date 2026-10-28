import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const kmlPath = process.argv[2];
if (!kmlPath) throw new Error('Usage: node scripts/build-us-state-coordinate-cache.mjs /path/to/cb_2025_us_state_5m.kml');

const sourceUrl = 'https://www2.census.gov/geo/tiger/GENZ2025/kml/cb_2025_us_state_5m.zip';
const localityOverrides = {
  '37.810000,-122.370000': { state: 'California', reason: 'The retained locality is San Francisco Bay Area; its representative water coordinate falls just outside the Census land polygon.' },
};
const kml = fs.readFileSync(path.resolve(kmlPath), 'utf8');
const states = parseStates(kml);
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const coordinates = new Map();

for (const row of rows) {
  if (!row.spotify_track_id || row.origin_country !== 'United States' || !row.origin_city) continue;
  const latitude = Number(row.origin_latitude);
  const longitude = Number(row.origin_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  const key = coordinateKey(latitude, longitude);
  const entry = coordinates.get(key) ?? { latitude, longitude, cities: new Set(), tracks: 0 };
  entry.cities.add(row.origin_city);
  entry.tracks += 1;
  coordinates.set(key, entry);
}

const assignments = [];
const unresolved = [];
for (const [key, coordinate] of coordinates) {
  const override = localityOverrides[key];
  const matches = override
    ? states.filter((state) => state.name === override.state)
    : states.filter((state) => state.polygons.some((polygon) => pointInPolygon(coordinate.longitude, coordinate.latitude, polygon)));
  if (matches.length !== 1) {
    unresolved.push({ key, cities: [...coordinate.cities].sort((left, right) => left.localeCompare(right)), tracks: coordinate.tracks, matches: matches.map((state) => state.name).sort((left, right) => left.localeCompare(right)) });
    continue;
  }
  const state = matches[0];
  assignments.push({
    key,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    cities: [...coordinate.cities].sort((left, right) => left.localeCompare(right)),
    tracks: coordinate.tracks,
    state: state.name,
    abbreviation: state.abbreviation,
    fips: state.fips,
    regionId: `region:united-states/${slug(state.name)}`,
    method: override ? 'named-locality override' : 'Census boundary point-in-polygon',
    note: override?.reason ?? null,
  });
}

assignments.sort((left, right) => right.tracks - left.tracks || left.state.localeCompare(right.state) || left.key.localeCompare(right.key));
unresolved.sort((left, right) => right.tracks - left.tracks || left.key.localeCompare(right.key));
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    authority: 'U.S. Census Bureau',
    title: '2025 State and Equivalent Entities, 1:5,000,000 Cartographic Boundary File',
    url: sourceUrl,
    kmlSha256: crypto.createHash('sha256').update(kml).digest('hex'),
  },
  method: 'Point-in-polygon assignment from each retained U.S. local-origin coordinate to one Census state or state-equivalent boundary. Rows without a local city are not assigned a state. A documented named-locality override handles a representative water coordinate outside the land polygon.',
  stateCount: states.length,
  coordinateCount: coordinates.size,
  assignedCoordinateCount: assignments.length,
  unresolvedCoordinateCount: unresolved.length,
  assignments,
  unresolved,
};

fs.writeFileSync(path.join(root, 'data', 'us-state-coordinate-cache.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ states: states.length, coordinates: coordinates.size, assigned: assignments.length, unresolved: unresolved.length, tracksAssigned: assignments.reduce((sum, item) => sum + item.tracks, 0) }, null, 2));

function parseStates(document) {
  const placemarks = document.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? [];
  return placemarks.map((placemark) => {
    const name = field(placemark, 'NAME');
    const abbreviation = field(placemark, 'STUSPS');
    const fips = field(placemark, 'STATEFP');
    const polygons = (placemark.match(/<Polygon\b[\s\S]*?<\/Polygon>/g) ?? []).map((polygon) => {
      const outer = polygon.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>/)?.[1];
      const holes = [...polygon.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/innerBoundaryIs>/g)].map((match) => parseRing(match[1]));
      return { outer: parseRing(outer ?? ''), holes };
    }).filter((polygon) => polygon.outer.length >= 3);
    if (!name || !abbreviation || !fips || !polygons.length) throw new Error('Census KML contains an incomplete state placemark.');
    return { name, abbreviation, fips, polygons };
  });
}

function field(placemark, name) {
  return decodeXml(placemark.match(new RegExp(`<SimpleData name="${name}">([\\s\\S]*?)<\\/SimpleData>`))?.[1]?.trim() ?? '');
}

function parseRing(value) {
  return value.trim().split(/\s+/).map((point) => point.split(',').slice(0, 2).map(Number)).filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
}

function pointInPolygon(x, y, polygon) {
  return pointInRing(x, y, polygon.outer) && !polygon.holes.some((ring) => pointInRing(x, y, ring));
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function coordinateKey(latitude, longitude) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function slug(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function decodeXml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
}
