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
  ['2za4bmJGxNpMUkNAYp3SCs', ['Country', 'Traditional bluegrass']],
  ['4N3IdbJr2NmIZTDDRIgojA', ['Electronic', 'Electropop']],
  ['4kAkohiTAshEC8dZt8IDWp', ['Electronic', 'Afro house']],
  ['60TmG8cFPMBo7kTTFOLiAB', ['Electronic', 'Synth-pop']],
]);

const retained = new Map([
  ['0gJUOnzOjv52vJgkpM25XF', 'Electronic'],
  ['0LbsURPGsQP92MjI3rbgBc', 'Electronic'],
  ['2AkcjsKlRbIBYGAgpQVFii', 'Classical'],
  ['0EO0VktcHvLqRM7T36aM3D', 'Classical'],
  ['68hDQBzV6t3O97PiaHkJ0b', 'Pop'],
  ['3EtEphYu9bikCNRRvk7PLH', 'Pop'],
]);

await test('batch 65 applies four exact recording-family corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-65/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('six reviewed crossover recordings retain direct catalog parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
  }
});

await test('batch 65 removes unsupported World from the exact Nyako remix only', () => {
  const row = byId.get('4kAkohiTAshEC8dZt8IDWp');
  assert.equal(row.genre_family, 'Electronic');
  assert.match(row.genre_evidence, /House|Afro/i);
  assert.doesNotMatch(row.genre_evidence, /nationality|geography/i);
});

await test('ranked-label queue remains at or below the batch-65 threshold with no high-priority rows', () => {
  assert.ok(queue.length <= 135);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
