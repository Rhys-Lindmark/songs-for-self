import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-18.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-18/'));

await test('batch 18 resolves 20 exact singleton tracks without broad propagation', () => {
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

await test('World decisions retain positive regional genre evidence', () => {
  const world = reviewed.filter((row) => row.genre_family === 'World');
  assert.deepEqual(world.map((row) => row.spotify_track_id), ['5zdoKVGxPqlyIyuhi8ZVtM']);
  assert.match(world[0].genre_evidence, /tango/i);
});

await test('contemporary covers and remixes use recording evidence', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '6ioe6K8aDV0A65qz6Huzs2')?.genre_family, 'Pop');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '7s6Z6jnhkaJRJA8Lmk2nyU')?.genre_family, 'Electronic');
});

await test('traditional repertoire remains distinct from contemporary folk', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '0QSrBADZ452PBcPnbHLhQS')?.genre_family, 'Traditional Folk');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '3X9ltszd6HXT6CKLtcc6r7')?.genre_family, 'Modern Folk');
});
