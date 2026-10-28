import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('../data/ranked-label-conflict-decisions.json', import.meta.url), 'utf8'));
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));

const corrected = new Map([
  ['47rqnVdDSquLFE67RuvYui', ['Modern Folk', 'Dark folk']],
  ['1Pe4hdraYdTG44U0ZPrI7n', ['Modern Folk', 'Indie folk']],
  ['5yys2BX9PfccpPfRP4XOHR', ['World', 'Romani folk']],
  ['2GaNZedsPuffC39LiKwGau', ['Modern Folk', 'Indie singer-songwriter']],
  ['0mRLSzS6ugu1mUxJPCCPjl', ['Modern Folk', 'Singer-songwriter']],
]);

const retained = new Map([
  ['2zKcfO2Z1RfBmxPRUX4D9L', 'World'],
  ['1YlSbH3aLrOTfsKV8tNa26', 'Traditional Folk'],
  ['3uo09WQ1gXXiB8icYbuI2b', 'World'],
  ['3ZMkCOpMO9EFk5gpakn2Ss', 'World'],
  ['4aO1N5EqsMdV1T3OThjCFc', 'World'],
]);

await test('batch 68 applies five exact folk and regional corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-68/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('five traditional or regional recordings retain source-backed parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
  }
});

await test('batch 68 decisions remain applied after later queue slices', () => {
  assert.ok(queue.length <= 105);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
