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

await test('history summary and compact per-song statistics resume with backward-compatible checkpoints', () => {
  const listening = {plays:8,msPlayed:1200000,firstPlayedAt:'2010-01-01T00:00:00.000Z',lastPlayedAt:'2026-10-30T00:00:00.000Z'};
  const history = {kind:'spotify-listening-history',format:'extended',files:2,events:8,uniqueTracks:1,totalMsPlayed:1200000,firstPlayedAt:listening.firstPlayedAt,lastPlayedAt:listening.lastPlayedAt,duplicates:1,skippedNonMusic:2,skippedInvalid:0,skippedZeroDuration:1};
  const snapshot = makeStoredPlaylistAnalysis('History', [{...track,listening}], Date.now(), history);
  assert.equal(isStoredPlaylistAnalysis(snapshot), true);
  assert.deepEqual(snapshot.listeningHistory, history);
  assert.equal(isStoredPlaylistAnalysis({...snapshot,listeningHistory:{...history,events:9}}), false);
  assert.equal(isStoredPlaylistAnalysis({...snapshot,listeningHistory:{...history,totalMsPlayed:1}}), false);
  assert.equal(isStoredPlaylistAnalysis({...snapshot,tracks:[{...track,listening:null}]}), false);
  assert.equal(isStoredPlaylistAnalysis({...snapshot,tracks:[{...track,listening:{...listening,plays:Infinity}}]}), false);
});
