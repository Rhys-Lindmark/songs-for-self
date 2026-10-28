import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true })
  .filter((row) => row.spotify_track_id);
const decisions = JSON.parse(fs.readFileSync(new URL('data/geography-overrides.json', root), 'utf8')).artists;
const expected = new Map([
  ['Vulfpeck', ['Michigan', 'Ann Arbor', 4]],
  ['DISPATCH', ['Vermont', 'Middlebury', 5]],
  ['People Under The Stairs', ['California', 'Los Angeles', 4]],
  ['Kishi Bashi', ['Washington', 'Seattle', 7]],
  ['Firewater', ['New York', 'New York City', 7]],
  ['J-Zone', ['New York', 'Queens', 7]],
]);

await test('batch 51 adds source-addressable state and city evidence without guessing', () => {
  for (const [artist, [region, city, count]] of expected) {
    const decision = decisions[artist];
    assert.ok(decision, `${artist} is missing its reviewed geography decision`);
    assert.match(decision.source, /^https:\/\//);
    assert.deepEqual([decision.country, decision.region, decision.city, decision.estimated], ['United States', region, city, false]);
    const matches = rows.filter((row) => row.artist_names.split('; ').includes(artist));
    assert.equal(matches.length, count, `${artist} track count changed`);
    assert.ok(matches.every((row) => row.origin_country_id === 'country:united-states'));
    assert.ok(matches.every((row) => row.origin_region === region && row.origin_region_id));
    assert.ok(matches.every((row) => row.origin_city === city && row.origin_city_id));
    assert.ok(matches.every((row) => row.origin_estimated === 'false' && row.origin_source.includes(decision.source)));
  }
});

await test('batch 51 changes only reviewed artist rows', () => {
  const reviewedArtists = new Set(expected.keys());
  const reviewedRows = rows.filter((row) => row.artist_names.split('; ').some((artist) => reviewedArtists.has(artist)));
  assert.equal(reviewedRows.length, [...expected.values()].reduce((sum, value) => sum + value[2], 0));
  assert.equal(reviewedRows.length, 34);
});
