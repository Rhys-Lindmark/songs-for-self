import assert from 'node:assert/strict';
import test from 'node:test';

import { isStoredPlaylistAnalysis, makeStoredPlaylistAnalysis, PLAYLIST_ANALYSIS_SCHEMA_VERSION } from '../lib/playlist-analysis-store.ts';

const track = {
  spotifyTrackId: '1234567890123456789012', track: 'Sunday Candy', artist: 'Nico Segal', year: 2013, genre: 'Hip-hop',
  x: 268.3, y: 188.2, city: 'Chicago', country: 'United States', method: 'exact track',
  genreSource: 'fixture:genre', genreConfidence: 'high', timeSource: 'fixture:time', timeConfidence: 'high', geographySource: 'fixture:place', geographyConfidence: 'high',
};

await test('creates a versioned browser-local playlist checkpoint', () => {
  const snapshot = makeStoredPlaylistAnalysis('spotify.csv', [track], 1_788_200_000_000);
  assert.equal(snapshot.version, PLAYLIST_ANALYSIS_SCHEMA_VERSION);
  assert.equal(snapshot.tracks.length, 1);
  assert.equal(isStoredPlaylistAnalysis(snapshot), true);
});

await test('rejects stale, empty, and structurally incomplete checkpoints', () => {
  assert.equal(isStoredPlaylistAnalysis({ version: 0, sourceName: 'old.csv', savedAt: Date.now(), tracks: [track] }), false);
  assert.equal(isStoredPlaylistAnalysis({ version: 1, sourceName: 'empty.csv', savedAt: Date.now(), tracks: [] }), false);
  assert.equal(isStoredPlaylistAnalysis({ version: 1, sourceName: 'broken.csv', savedAt: Date.now(), tracks: [{ track: 'Broken' }] }), false);
});
