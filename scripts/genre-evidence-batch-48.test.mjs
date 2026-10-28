import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-48.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-48/'));

await test('batch 48 corrects exactly twelve source-addressable tracks without artist propagation', () => {
  assert.equal(reviewed.length, 12);
  assert.equal(Object.keys(decisions.tracks).length, 12);
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`) && row.genre_confidence === 'medium'));
});

await test('false World placements move only with positive genre evidence', () => {
  const ids = ['783pJ4qpLh3EWC7DOhy9m1', '0OmCgZtMB50G2XZLPob11E', '4DwnzuLfQcpGGKBHLBZin3', '3WTxLG2VqqkHlsIwjOZEYf'];
  const byId = new Map(rows.map((row) => [row.spotify_track_id, row]));
  assert.ok(ids.every((id) => byId.get(id).genre_family !== 'World'));
  assert.ok(ids.every((id) => decisions.tracks[id].evidence.some((url) => url.startsWith('https://noteverynoise.com/'))));
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
});
