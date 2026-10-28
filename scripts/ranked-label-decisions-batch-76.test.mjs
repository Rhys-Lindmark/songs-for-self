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
  ['268jT4m5ztrceh5qdzpQ68', ['Pop', 'Disco pop']],
  ['1Xl6ruZYD2IBuyvOnxCkEJ', ['Rock', 'Industrial metal']],
  ['2BkWokfWbWNlZ13oRMXYNX', ['Rock', 'Nu metal']],
]);
const retained = new Map([
  ['0tdHittlEah9GOXVRx3CHu', 'Electronic'], ['2SKY9fnLJvVeumhID9wOk7', 'Electronic'],
  ['4xUsNE1QeUxuFyk4z8g8TE', 'Modern Folk'], ['75SS50WWBZINsZgccsSnGs', 'Electronic'],
  ['6YkHLUPBUttfwepwFgNNGX', 'Electronic'], ['5CrxyHP494lmFlLCOdiva8', 'Electronic'],
  ['1qHeVLeFeMrpbkR9yaNsd5', 'Electronic'], ['5E16OQaCqgzjtyC7EHNBgy', 'Pop'],
]);

await test('batch 76 applies three direct exact-product corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-76/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('eight exact product decisions retain their source-backed parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    assert.equal(decisions.groups[decisions.tracks[trackId]].action, 'retain');
  }
});

await test('ranked-label queue stays at or below the batch-76 ceiling with only low-priority rows', () => {
  assert.ok(queue.length <= 24);
  assert.equal(queue.filter((row) => row.review_priority !== 'low').length, 0);
});
