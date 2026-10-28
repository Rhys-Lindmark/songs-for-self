import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));

const corrected = new Map([
  ['6UO9zXHT5dOrxOLr5yReBk', ['World', 'Reggae']],
  ['6Kb4IQedEdCPMJzh1GloXQ', ['Hip-hop', 'Alternative hip-hop']],
  ['5JmrXXEpuOwQHhUyGF67O0', ['Pop', 'Alternative pop']],
]);

const retained = new Map([
  ['0yLrVTHEVgzheu4zRVqmls', 'Modern Folk'],
  ['1hcLOIbNWTw227ozhWWXLL', 'Modern Folk'],
  ['0OXw4G15BE3KkRnxtnDzJd', 'Modern Folk'],
  ['6Lmci7qMty7X9VmfhV6RhK', 'Modern Folk'],
  ['4vC4e7XGcjzg5o30YGrwxm', 'Country'],
  ['0cJiOFuB3zftGKDRE0UhYf', 'World'],
  ['7iR5sSLTH2ACtcbLpntsdR', 'World'],
]);

await test('batch 64 applies three exact album-family corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-64/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('seven reviewed roots and reggae tracks retain supported parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
  }
});

await test('ranked-label queue falls to 145 with no high-priority rows', () => {
  assert.ok(queue.length <= 145);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
