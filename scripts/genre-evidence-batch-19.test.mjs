import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-19.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-19/'));

await test('batch 19 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('batch 19 World decisions retain positive style evidence', () => {
  const expected = ['2Nhv16i9DIjcY3x8pqSLEg', '2YwhgTmgxuu2tiYxeOggnG', '2jzhIawTix2yYyc5PL9kHw', '3sWihNY9u8Lok8K2L73kQW'];
  const byId = (left, right) => left.localeCompare(right);
  assert.deepEqual(reviewed.filter((row) => row.genre_family === 'World').map((row) => row.spotify_track_id).sort(byId), expected.sort(byId));
  assert.ok(reviewed.filter((row) => row.genre_family === 'World').every((row) => /arabic|yemeni|afro|dembow|reggae|steelband|trinidad|caribbean/i.test(row.genre_evidence)));
});

await test('American surf arrangement does not inherit source geography', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '1p791U7Bx5PmvCwucN4PQN')?.genre_family, 'Rock');
});

await test('authored and anonymous folk decisions remain distinct', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '6aD4FfQUi0AR67F8bLrWKx')?.genre_family, 'Modern Folk');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '6Z0ffOQmaZK5rUZ5mw5QMG')?.genre_family, 'Traditional Folk');
});
