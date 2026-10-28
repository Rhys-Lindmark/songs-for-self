import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-16.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-16/'));

await test('batch 16 resolves 26 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 26);
  assert.equal(Object.keys(decisions.tracks).length, 26);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  assert.ok(reviewed.every((row) => row.genre_evidence.startsWith('https://')));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.ok(decision, `Missing batch 16 decision for ${row.artist_names} — ${row.track_name}`);
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('World decisions have positive cultural or regional genre evidence', () => {
  const expected = ['3C4cctVhgIqcfe8yDrWUXt', '5JacNN0YtAJOodfpmKn2r8', '08AxpxQqxUjhlU9dwFNWfv'];
  const world = reviewed.filter((row) => row.genre_family === 'World');
  const byId = (left, right) => left.localeCompare(right);
  assert.deepEqual(world.map((row) => row.spotify_track_id).sort(byId), expected.sort(byId));
  assert.ok(world.every((row) => /folkways|jewishlibraries|piseiro|vaquejada/i.test(row.genre_evidence)));
});

await test('titles and geography do not silently become World evidence', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '4rtwtNuk3Btw0ciIq2sUIL')?.genre_family, 'Rock');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '0L2rbBHxOiYkOmfab6ymPY')?.genre_family, 'Pop');
});

await test('authored folk and traditional repertoire remain distinct', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '7hLTvTcye9JSTdJaMAYPDF')?.genre_family, 'Modern Folk');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '3436Wpask5KQml4XHNieGv')?.genre_family, 'Modern Folk');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '6EHb3GZJeZaw1QnxmSxHHV')?.genre_family, 'Traditional Folk');
});
