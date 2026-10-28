import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('../data/ranked-label-conflict-decisions.json', import.meta.url), 'utf8'));
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));
const ruthIds = ['7CX1sZDl8eBmD5p2EF1q2Z', '313oEiwJWyQHDsXuMncFeY', '7yqRZcNUOGwTJCx8JPHPGx'];

await test('batch 59 corrects exactly three Ruth Pelham recordings to Modern Folk', () => {
  assert.equal(ruthIds.length, 3);
  for (const trackId of ruthIds) {
    const row = byId.get(trackId);
    assert.equal(row.artist_names, 'Ruth Pelham');
    assert.equal(row.genre_family, 'Modern Folk');
    assert.equal(row.genre_primary, "Children's folk");
    assert.equal(row.genre_confidence, 'high');
    assert.equal(row.genre_source, `editorial:genre-evidence-batch-59/track/${trackId}`);
    assert.match(row.genre_evidence, /music\.apple\.com\/us\/artist\/ruth-pelham/);
    assert.equal(queued.has(trackId), false);
  }
});

await test('reviewed retain decisions preserve their canonical families', () => {
  for (const [trackId, groupId] of Object.entries(decisions.tracks)) {
    const group = decisions.groups[groupId];
    if (group.action !== 'retain') continue;
    assert.equal(byId.get(trackId)?.genre_family, group.currentFamily, `${trackId} no longer matches retained family`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('ranked-label review has no remaining high-priority cluster', () => {
  assert.ok(queue.length <= 197);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
