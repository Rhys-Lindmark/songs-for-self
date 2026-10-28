import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-12.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-12/'));

await test('batch 12 decisions remain album- or track-specific and source-addressable', () => {
  // Two Makem/Clancy album rows are intentionally superseded by batch 62's
  // exact-track authored-composition evidence.
  assert.equal(reviewed.length, 36);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_evidence.startsWith('https://')));
  assert.ok(reviewed.every((row) => row.genre_estimated === 'false'));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id] ?? decisions.albums[row.spotify_album_id];
    assert.ok(decision, `Missing batch 12 decision for ${row.artist_names} — ${row.track_name}`);
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('later exact-track evidence can supersede a broader batch 12 album decision', () => {
  for (const trackId of ['7CcKXKJb8GuyBkTQw1ogny', '54eEaPP6sXPgsa1upfOqy1']) {
    const row = rows.find((candidate) => candidate.spotify_track_id === trackId);
    assert.equal(row.genre_family, 'Modern Folk');
    assert.equal(row.genre_source, `editorial:genre-evidence-batch-62/track/${trackId}`);
  }
});

await test('track decisions outrank soundtrack and featured-artist propagation', () => {
  const roseMurphy = rows.find((row) => row.spotify_track_id === '2VDL3zhGqo4SMFwrr8R2pz');
  assert.equal(roseMurphy.genre_family, 'Jazz');
  assert.match(roseMurphy.genre_source, /\/track\/2VDL3zhGqo4SMFwrr8R2pz$/);

  const hymn = rows.find((row) => row.spotify_track_id === '2RAx39CK4v8BWBz2JwfYTb');
  assert.equal(hymn.genre_family, 'Modern Folk');
  assert.equal(hymn.genre_primary, 'Contemporary hymn');
  assert.ok(!hymn.genre_source.startsWith('inferred:catalog-'));
});

await test('batch 12 album evidence never relabels unrelated artist catalog rows', () => {
  const davidLandauRock = rows.find((row) => row.spotify_track_id === '11k8GnsmZk2GvBEnaFny4a');
  assert.equal(davidLandauRock.genre_family, 'Rock');
  assert.ok(!davidLandauRock.genre_source.includes('batch-12'));

  const shahramSymphony = rows.find((row) => row.spotify_track_id === '2e4KeWR0Ym9CTBrSG08FSc');
  assert.equal(shahramSymphony.genre_family, 'Classical');
  assert.ok(!shahramSymphony.genre_source.includes('batch-12'));
});
