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
  ['6QAmlRQ9whFYW2PfcjsZ3d', ['Pop', 'Turkish pop']],
  ['2EM9zpAc7PVeoAydmbfVIL', ['Pop', 'Latin pop']],
]);

const retained = new Map([
  ['0kBM8wIxlqbKL97cKbYpNC', 'Electronic'], ['4Q4ZrHlqrfFQPeZ0yubmYG', 'World'],
  ['4leHHwUSR0Vm5rjYvHhBEU', 'World'], ['4mzUXLXB7bP39K7CCJzouR', 'World'],
  ['34aSv8AVL6LfngS7JE7oeA', 'Electronic'], ['2nRyzdeN1Q3tFidJ4WdHuZ', 'World'],
  ['62y1Hmyio3Pj8ZBi2Ds3MI', 'World'], ['7wM1166obCm9BA4wxtCPGg', 'Classical'],
]);

await test('batch 70 applies two exact pop corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-70/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('eight exact catalog decisions retain their source-backed parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.length >= 2);
  }
});

await test('batch 70 decisions remain applied after later queue slices', () => {
  assert.ok(queue.length <= 85);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
