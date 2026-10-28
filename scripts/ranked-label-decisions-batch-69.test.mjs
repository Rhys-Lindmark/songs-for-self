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
  ['6ol4ZSifr7r3Lb2a9L5ZAB', ['Pop', 'Pop']],
  ['4RrpTNBLLu4vJwr9At7gkI', ['Pop', 'Ambient pop']],
  ['4m7p2dejJrMiiA1vg8LDPK', ['Pop', 'German pop']],
  ['57NbelD7NoWpb6dXVcOEbM', ['Pop', 'Latin pop']],
  ['08b1bCjsKjMzhjBm0qhkof', ['Rock', 'Dream pop']],
]);

const retained = new Map([
  ['4Uua3lZKDwKeX0Amw6PoRD', 'World'],
  ['1Hp47zODYJvAKF8kYCy3s7', 'World'],
  ['0E0DRHf5PfMeor0ZCwB3oT', 'World'],
  ['5J6JxUSQPyeNPp1yCyBecd', 'World'],
  ['409BC24PyUgRLQdGGdyGwT', 'Electronic'],
]);

await test('batch 69 applies five exact pop and rock corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-69/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('five source-backed crossover decisions retain their current parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.length >= 2);
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
  }
});

await test('World retains require positive named-style or catalog evidence', () => {
  for (const trackId of ['4Uua3lZKDwKeX0Amw6PoRD', '1Hp47zODYJvAKF8kYCy3s7', '0E0DRHf5PfMeor0ZCwB3oT', '5J6JxUSQPyeNPp1yCyBecd']) {
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.match(group.rationale, /(Tierra Caliente|salsa|reggaeton|cumbia|mambo|bolero|Música tropical)/i);
  }
});

await test('batch 69 decisions remain applied after later queue slices', () => {
  assert.ok(queue.length <= 95);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
