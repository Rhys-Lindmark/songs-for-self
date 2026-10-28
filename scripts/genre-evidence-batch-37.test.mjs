import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';
const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-37.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-37/'));
await test('batch 37 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20); assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});
await test('instrumental game-theme product mapping stays medium confidence', () => {
  const decision = decisions.tracks['0GgS789G1FInCqKGNrzSJQ'];
  assert.equal(decision.family, 'Pop'); assert.equal(decision.confidence, 'medium');
});
await test('Mandopop and Americana do not become World from identity', () => {
  assert.equal(decisions.tracks['1a2G1oAKraQxOzzK2rfN4R'].family, 'Pop');
  assert.equal(decisions.tracks['373lax965JHGRtIOFjVI3s'].family, 'Country');
  assert.match(decisions.tracks['373lax965JHGRtIOFjVI3s'].rationale, /not World/i);
});
await test('Scottish military-band repertoire retains positive Traditional Folk evidence', () => {
  const decision = decisions.tracks['6weEruGZg2UzEGb55EEIjR'];
  assert.equal(decision.family, 'Traditional Folk'); assert.match(decision.rationale, /Scottish pipe-band/i);
});
