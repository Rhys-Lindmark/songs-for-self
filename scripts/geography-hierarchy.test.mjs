import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true })
  .filter((row) => row.spotify_track_id);
const viz = JSON.parse(fs.readFileSync(new URL('data/viz-data.json', root), 'utf8'));

await test('every available track has stable country geography', () => {
  assert.equal(rows.length, 7582);
  assert.equal(rows.filter((row) => row.origin_country).length, 7582);
  assert.equal(rows.filter((row) => row.origin_country_id).length, 7582);
  assert.equal(rows.filter((row) => row.origin_country_id === `country:${slug(row.origin_country)}`).length, 7582);
});

await test('country aggregates retain exact total and populated-year coverage', () => {
  const countries = viz.geography.countries;
  assert.equal(countries.reduce((sum, country) => sum + country.count, 0), 7582);
  assert.equal(countries.reduce((sum, country) => sum + Object.values(country.years).reduce((yearSum, count) => yearSum + count, 0), 0), 7582);
  assert.ok(countries.every((country) => country.id && country.label && country.count > 0));
  assert.ok(countries.every((country) => country.children.reduce((sum, child) => sum + child.count, 0) === country.count));
});

await test('geographic aggregates expose four ranked visual artists with provenance', () => {
  const units = viz.geography.countries.flatMap(walk);
  assert.ok(units.every((unit) => unit.topArtists.length <= 4));
  assert.ok(units.every((unit) => unit.topArtists.every((artist, index, artists) => artist.id && artist.name && artist.count > 0 && (index === 0 || artists[index - 1].count >= artist.count))));
  const unitedStates = viz.geography.countries.find((country) => country.label === 'United States');
  assert.deepEqual(unitedStates.topArtists.map(({ name, count }) => [name, count]), [['Taylor Swift', 40], ['Kanye West', 34], ['Bo Burnham', 25], ['Flogging Molly', 23]]);
  assert.ok(unitedStates.topArtists.filter((artist) => artist.imageUrl).every((artist) => artist.imageSource === 'Wikimedia Commons' && artist.imageSourceUrl));
});

await test('United States drills from country to complete state totals and then cities', () => {
  const unitedStates = viz.geography.countries.find((country) => country.label === 'United States');
  assert.equal(unitedStates.count, 4427);
  assert.equal(unitedStates.children.reduce((sum, state) => sum + state.count, 0), unitedStates.count);
  assert.equal(unitedStates.children.at(-1).label, 'State not yet known');
  assert.equal(unitedStates.children.at(-1).count, 1249);
  const california = unitedStates.children.find((state) => state.label === 'California');
  const newYork = unitedStates.children.find((state) => state.label === 'New York');
  assert.equal(california.id, 'region:united-states/california');
  assert.equal(california.children.reduce((sum, city) => sum + city.count, 0), california.count);
  assert.equal(newYork.children.reduce((sum, city) => sum + city.count, 0), newYork.count);
  assert.ok(california.children.some((city) => city.label === 'Los Angeles' && city.count > 200));
  assert.ok(newYork.children.some((city) => city.label === 'Brooklyn' && city.count > 100));
});

await test('Census boundary cache and reviewed overrides assign retained United States city coordinates', () => {
  const cache = JSON.parse(fs.readFileSync(new URL('data/us-state-coordinate-cache.json', root), 'utf8'));
  assert.equal(cache.source.authority, 'U.S. Census Bureau');
  assert.match(cache.source.url, /census\.gov\/geo\/tiger\/GENZ2025/);
  assert.match(cache.source.kmlSha256, /^[a-f0-9]{64}$/);
  assert.equal(cache.coordinateCount, 563);
  assert.equal(cache.assignedCoordinateCount, 563);
  assert.equal(cache.unresolvedCoordinateCount, 0);
  assert.equal(cache.assignments.reduce((sum, assignment) => sum + assignment.tracks, 0), 3144);
  assert.equal(rows.filter((row) => row.origin_country === 'United States' && row.origin_city && row.origin_region_id).length, 3178);
  const bayArea = cache.assignments.find((assignment) => assignment.cities.includes('San Francisco Bay Area'));
  assert.deepEqual([bayArea.state, bayArea.method], ['California', 'named-locality override']);
});

await test('named geography fixtures aggregate at country level', () => {
  const byLabel = new Map(viz.geography.countries.map((country) => [country.label, country]));
  assert.equal(byLabel.get('Nigeria')?.count, 22);
  assert.equal(byLabel.get('India')?.count, 25);
  const iran = byLabel.get('Iran');
  const saudiArabia = byLabel.get('Saudi Arabia');
  assert.deepEqual([iran?.id, iran?.count, iran?.sourcedCount, iran?.estimatedCount], ['country:iran', 14, 12, 2]);
  assert.deepEqual([saudiArabia?.id, saudiArabia?.count, saudiArabia?.sourcedCount, saudiArabia?.estimatedCount], ['country:saudi-arabia', 3, 3, 0]);
  assert.equal(iran.children.reduce((sum, child) => sum + child.count, 0), iran.count);
  assert.equal(saudiArabia.children.reduce((sum, child) => sum + child.count, 0), saudiArabia.count);
  assert.deepEqual(iran.children.slice(0, 2).map(({ id, count }) => [id, count]), [['city:iran/tehran', 7], ['city:iran/kermanshah', 3]]);
  assert.deepEqual(saudiArabia.children.map(({ id, count }) => [id, count]), [['city:saudi-arabia/riyadh', 2], ['city:saudi-arabia/jeddah', 1]]);
  assert.deepEqual(iran.topArtists.slice(0, 3).map(({ name, count }) => [name, count]), [['Ramin Rahimi', 3], ['Kayhan Kalhor', 2], ['Shahram Nazeri', 2]]);
  assert.deepEqual(saudiArabia.topArtists.map(({ name, count }) => [name, count]), [['Alaa Wardi', 1], ['Arooj Aftab', 1], ['Mar1', 1]]);
  assert.equal(byLabel.get("People's Republic of China")?.id, 'country:people-s-republic-of-china');
  assert.equal(byLabel.get('United Kingdom')?.children.find((child) => child.label === 'London')?.count, 287);
  assert.equal(byLabel.get('United Kingdom')?.children.find((child) => child.label === 'Liverpool')?.count, 49);
  assert.equal(rows.filter((row) => row.artist_names.includes('Burna Boy') && row.origin_country === 'Nigeria').length, 4);
  assert.equal(rows.filter((row) => row.origin_country === 'Iran' && row.origin_country_id === 'country:iran').length, 14);
  assert.equal(rows.filter((row) => row.origin_country === 'Saudi Arabia' && row.origin_country_id === 'country:saudi-arabia').length, 3);
  assert.ok(rows.filter((row) => ['Iran', 'Saudi Arabia'].includes(row.origin_country)).every((row) => row.origin_source && row.origin_confidence && row.origin_city_id));
});

await test('country-as-city source records are promoted without losing provenance', () => {
  const knife = rows.find((row) => row.artist_names === 'The Knife');
  const toots = rows.find((row) => row.artist_names === 'Toots & The Maytals');
  assert.deepEqual([knife.origin_city, knife.origin_country, knife.origin_country_id, knife.origin_scope], ['', 'Sweden', 'country:sweden', 'country']);
  assert.deepEqual([toots.origin_city, toots.origin_country, toots.origin_country_id, toots.origin_scope], ['', 'Jamaica', 'country:jamaica', 'country']);
  assert.match(knife.origin_source, /editorial:country-promotion\/2026-08-30/);
  assert.match(toots.origin_source, /editorial:country-promotion\/2026-08-30/);
});

function slug(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function walk(unit) {
  return [unit, ...unit.children.flatMap(walk)];
}
