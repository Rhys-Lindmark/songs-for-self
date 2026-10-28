import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-17.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-17/'));
const byId = new Map(rows.map((row) => [row.spotify_track_id, row]));

await test('batch 17 remains track-scoped while later exact evidence supersedes one recording', () => {
  assert.equal(reviewed.length, 19);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
  assert.equal(byId.get('5GdNfIicmCrLYiBY4Y9Vr3')?.genre_source, 'editorial:genre-evidence-batch-75/track/5GdNfIicmCrLYiBY4Y9Vr3');
});

await test('World decisions retain positive genre evidence', () => {
  const expected = ['5N2Xe1JnNlAn54dFEMFwXJ', '5I6w1rMCttsLw8ZHuffUQS'];
  const byId = (left, right) => left.localeCompare(right);
  assert.deepEqual(reviewed.filter((row) => row.genre_family === 'World').map((row) => row.spotify_track_id).sort(byId), expected.sort(byId));
  assert.ok(reviewed.filter((row) => row.genre_family === 'World').every((row) => /uvic|audiograma|shazam/i.test(row.genre_evidence)));
});

await test('American and British novelty covers stay Pop rather than World', () => {
  for (const id of ['2y1S91jeSsO5nRh44Uydan', '4xwj8TjpPKZt6WsptiVMnD', '4gUUVvFMtPv7adDADxUfNc']) {
    assert.equal(reviewed.find((row) => row.spotify_track_id === id)?.genre_family, 'Pop');
  }
});

await test('traditional repertoire remains distinct from authored modern folk', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '52DqyorqxxJEAV7FOBvYxP')?.genre_family, 'Traditional Folk');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '2R75WvYrDHlmmKgej7RW8m')?.genre_family, 'Modern Folk');
});
