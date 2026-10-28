import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-46.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-46/'));

await test('batch 46 resolves the final sixteen rows without broad propagation', () => {
  assert.equal(reviewed.length, 16);
  assert.equal(Object.keys(decisions.tracks).length, 16);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('direct catalog genre fields remain high confidence', () => {
  for (const id of ['2GpqCQxKlKrgsTdcBKq8L4', '74gKEcg6BUL6LeePJHeJxh', '5F6LAB0Q4110GHpOtKlJhZ']) assert.equal(decisions.tracks[id].confidence, 'high');
});

await test('musical identity and adjacent-catalog calls remain medium confidence', () => {
  for (const id of ['2wm6XXZr3nV8trRDVQLpUI', '0FnxTfgOYiOfrgn6KuhYLd', '0eVVgQS6uo9UvL3Pc2lIyW', '4WyZpgPwEuA3zUmYN6Wm2P', '1fBb08dygTsgVLOQm1ltPk', '1tTQ5Y7V244cAQBaExzoiY', '0Mx5ejGNHP5SHi6K0vZItR', '0KCs9o5Fz3hzg5R0fasaB2', '7IKcR4ZVucM3MMW0WT7z39']) {
    assert.equal(decisions.tracks[id].confidence, 'medium');
  }
});

await test('unavailable or identity-ambiguous rows remain low confidence and do not invent identities', () => {
  for (const id of ['6SRAArq2Zvb6LQtZuu2HuO', '69gRFGOWY9OMpFJgFol1u0', '4h8hjfKfDeCAun1A6bwjJD', '1e6kD8AXQ152lFZLr7kKPN']) {
    assert.equal(decisions.tracks[id].confidence, 'low');
  }
  assert.match(decisions.tracks['69gRFGOWY9OMpFJgFol1u0'].rationale, /no missing identity is invented/i);
});

await test('batch does not infer World from titles or geography', () => {
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
});
