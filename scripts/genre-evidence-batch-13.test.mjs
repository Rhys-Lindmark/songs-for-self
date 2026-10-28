import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-13.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-13/'));

await test('batch 13 moves 40 repeat-tail tracks out of Other with scoped evidence', () => {
  assert.equal(reviewed.length, 40);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_evidence.startsWith('https://')));
  assert.ok(reviewed.every((row) => row.genre_estimated === 'false'));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id] ?? decisions.albums[row.spotify_album_id];
    assert.ok(decision, `Missing batch 13 decision for ${row.artist_names} — ${row.track_name}`);
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('track-scoped note-block covers retain the source composition family', () => {
  const astronomia = rows.find((row) => row.spotify_track_id === '2oMjc7AGwZSfJPFc0oEZLS');
  const danceMonkey = rows.find((row) => row.spotify_track_id === '6aBhLLF21UidbCjt6U5473');
  assert.equal(astronomia.genre_family, 'Electronic');
  assert.equal(danceMonkey.genre_family, 'Pop');
  assert.match(astronomia.genre_source, /\/track\/2oMjc7AGwZSfJPFc0oEZLS$/);
  assert.match(danceMonkey.genre_source, /\/track\/6aBhLLF21UidbCjt6U5473$/);
});

await test('geography does not turn Spanish and Chinese pop into World', () => {
  const tonyRonald = reviewed.filter((row) => row.artist_names === 'Tony Ronald');
  const wowkieDa = reviewed.filter((row) => row.artist_names === 'Wowkie Da');
  assert.equal(tonyRonald.length, 2);
  assert.equal(wowkieDa.length, 2);
  assert.ok([...tonyRonald, ...wowkieDa].every((row) => row.genre_family === 'Pop'));
});

await test('cross-genre album decisions do not propagate artist-wide', () => {
  const turnerRows = reviewed.filter((row) => row.artist_names === 'Turner Jackson');
  assert.equal(turnerRows.length, 2);
  assert.ok(turnerRows.every((row) => row.genre_family === 'Pop'));
  assert.ok(turnerRows.every((row) => row.genre_source.includes(`/album/${row.spotify_album_id}`)));
});
