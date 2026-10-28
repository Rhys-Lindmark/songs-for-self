import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-45.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-45/'));

await test('batch 45 resolves six strict singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 6);
  assert.equal(Object.keys(decisions.tracks).length, 6);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('exact release and album evidence maps to requested parents', () => {
  assert.equal(decisions.tracks['1EVcxq03TzCCEBXFSR5VL8'].family, 'Rock');
  assert.equal(decisions.tracks['64yqQpp62VMDP9f2bjw9YD'].family, 'R&B, Soul & Blues');
  assert.equal(decisions.tracks['541yxGQI96rRvvaFSDRT5J'].family, 'Pop');
  assert.equal(decisions.tracks['5Thinx7DHaNXPPSv4WvC1N'].family, 'Country');
});

await test('source-composition and recording-content calls remain medium confidence', () => {
  for (const id of ['74FDHHiaNBLu9fGHzXdH6g', '7aloxp7AzP0eBuNBFJKxfo']) assert.equal(decisions.tracks[id].confidence, 'medium');
});

await test('batch does not infer World from artist or recording geography', () => {
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
});
