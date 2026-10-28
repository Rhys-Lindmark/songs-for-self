import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));
const hotChip = ['7BR8iLWgruHFVRKMMDnIXD', '6m5D7zGVbzAxceDXQTsRSX'];
const retained = new Map([
  ['4L39GqFUUdSZoj0PlZFGUO', 'Modern Folk'],
  ['1nOqFDZ69Rn2qulp0Hxq8k', 'Modern Folk'],
  ['1UDyVWm95oTMyDlbLIy30A', 'Pop'],
  ['0XIHRIerpIPFLCjlgeLHbN', 'Pop'],
  ['2vw4PTkqXpdFeSl9YchxnA', 'Electronic'],
  ['0dcZGdle3E5O4qwURGHv9E', 'Electronic'],
  ['6gqJJwkvzyXXj8SUEJgP4g', 'Electronic'],
  ['3r2CpMRlTWexGhZhQeJtAo', 'Electronic'],
]);

await test('batch 61 moves two exact Hot Chip recordings to Electronic', () => {
  for (const trackId of hotChip) {
    const row = byId.get(trackId);
    assert.equal(row.artist_names, 'Hot Chip');
    assert.equal(row.genre_family, 'Electronic');
    assert.equal(row.genre_primary, 'Electropop');
    assert.equal(row.genre_source, `editorial:genre-evidence-batch-61/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('eight reviewed crossover tracks retain direct catalog parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
  }
});

await test('ranked-label queue falls to 175 with no high-priority rows', () => {
  assert.ok(queue.length <= 175);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
