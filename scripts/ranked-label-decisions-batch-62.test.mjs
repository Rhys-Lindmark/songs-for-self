import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));

const corrected = new Map([
  ['6hH6QJ9ZAO0Z6m7PfvLoXW', ['Pop', 'Latin pop']],
  ['3BQPPsoxlhuSIEPlNRHHZt', ['Pop', 'Latin pop']],
  ['7CcKXKJb8GuyBkTQw1ogny', ['Modern Folk', 'Contemporary folk']],
  ['54eEaPP6sXPgsa1upfOqy1', ['Modern Folk', 'Contemporary folk']],
]);

const retained = new Map([
  ['3PDGbCcg4vX8Jb2upTWkCJ', 'World'],
  ['2Aq96s8J9ut4j5DZenNdJ8', 'World'],
  ['2ObXoMxUPDgIWtKDDkhYqz', 'Traditional Folk'],
  ['0YFfboy2zZtPPaKsLyEHnd', 'Traditional Folk'],
  ['10UdGlPNDTpFUQlKn2E9DZ', 'World'],
  ['6HxPYOtbNu4kIhWLeHJ3fP', 'World'],
]);

await test('batch 62 applies four exact regional and folk corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-62/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('six reviewed regional recordings retain their evidence-backed families', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
  }
});

await test('ranked-label queue falls to 165 with no high-priority rows', () => {
  assert.ok(queue.length <= 165);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
