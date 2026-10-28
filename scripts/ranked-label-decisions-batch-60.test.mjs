import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));
const expected = new Map([
  ['2Ts1UxZn53VkDdbkngfdGV', ['Die Antwoord', 'Hip-hop']],
  ['3ckwU0TBQ0NUJ1elmDLMtZ', ['Die Antwoord', 'Hip-hop']],
  ['6yDu6UVWQ820sn3nkh1sag', ['Die Antwoord', 'Hip-hop']],
  ['4dmCLAZbWYT0qtcG7GVMdb', ['Santigold', 'Pop']],
  ['4yK3xXuNrkSq0OVjKUaCkY', ['Santigold', 'Pop']],
  ['1BaVwEV5FogbZuCzpSc7Jl', ['Santigold', 'Pop']],
  ['6Neq7tjnknt4URNI8txFL4', ['Sugar Ray', 'Rock']],
  ['5fuGP7Dze9tkadS9WoPbar', ['Sugar Ray', 'Rock']],
  ['6NcHJ23mLQKnVxQcOmT7JW', ['Sugar Ray', 'Rock']],
]);
const ondatropica = ['7Jq0pQrsJqNiYUMD3MfOxy', '0TEgK2OCQibruKMkHRkB4q', '6Ax5UCbftxzcjJ8cg3WtFT'];

await test('batch 60 applies nine exact recording-family corrections', () => {
  assert.equal(expected.size, 9);
  for (const [trackId, [artist, family]] of expected) {
    const row = byId.get(trackId);
    assert.equal(row.artist_names, artist);
    assert.equal(row.genre_family, family);
    assert.equal(row.genre_confidence, 'high');
    assert.equal(row.genre_source, `editorial:genre-evidence-batch-60/track/${trackId}`);
    assert.match(row.genre_evidence, /music\.apple\.com/);
    assert.equal(queued.has(trackId), false);
  }
});

await test('Ondatrópica retains World through positive regional genre evidence', () => {
  for (const trackId of ondatropica) {
    const row = byId.get(trackId);
    assert.equal(row.artist_names, 'Ondatrópica');
    assert.equal(row.genre_family, 'World');
    assert.equal(queued.has(trackId), false);
  }
});

await test('medium-priority queue shrinks by twelve without restoring high-priority rows', () => {
  assert.ok(queue.length <= 185);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
