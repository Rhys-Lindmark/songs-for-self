import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isStoredSpotifyCopiedImport,
  makeStoredSpotifyCopiedImport,
  SPOTIFY_COPIED_IMPORT_SCHEMA_VERSION,
} from '../lib/spotify-copied-import-store.ts';

const first = '0000000000000000000001';
const second = '0000000000000000000002';
const firstRow = {
  'Track Name': 'Sabali',
  'Artist Name(s)': 'Amadou & Mariam',
  'Spotify Track ID': first,
};

await test('accepts a versioned partial checkpoint while retaining duplicate playlist positions', () => {
  const snapshot = makeStoredSpotifyCopiedImport([first, second, first], { [first]: firstRow }, 1_788_200_000_000);
  assert.equal(snapshot.version, SPOTIFY_COPIED_IMPORT_SCHEMA_VERSION);
  assert.deepEqual(snapshot.trackIds, [first, second, first]);
  assert.equal(Object.keys(snapshot.rowsById).length, 1);
  assert.equal(isStoredSpotifyCopiedImport(snapshot), true);
});

await test('rejects stale, oversized, invalid, and mismatched copied-import checkpoints', () => {
  const valid = makeStoredSpotifyCopiedImport([first], { [first]: firstRow });
  assert.equal(isStoredSpotifyCopiedImport({ ...valid, version: 0 }), false);
  assert.equal(isStoredSpotifyCopiedImport({ ...valid, trackIds: Array.from({ length: 10_001 }, () => first) }), false);
  assert.equal(isStoredSpotifyCopiedImport({ ...valid, trackIds: ['not-a-track-id'] }), false);
  assert.equal(isStoredSpotifyCopiedImport({ ...valid, rowsById: { [first]: { ...firstRow, 'Spotify Track ID': second } } }), false);
});
