import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-22.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-22/'));
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));

await test('batch 22 retains eighteen active rows while later exact reviews supersede two tracks', () => {
  assert.equal(reviewed.length, 18);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('batch 22 World decisions retain positive named-style evidence', () => {
  const expected = ['784oHxhD6TWkHxnj41rZwf', '3WYGWuvdDL5XsU9k77rGc9', '1k2xyMfz9CBMyQIZd9pj7v'];
  const byId = (left, right) => left.localeCompare(right);
  const actual = reviewed.filter((row) => row.genre_family === 'World').map((row) => row.spotify_track_id).sort(byId);
  assert.deepEqual(actual, expected.sort(byId));
  assert.ok(expected.every((id) => /kirtan|arabic|shamisen/i.test(decisions.tracks[id].primary)));
});

await test('soundtrack and traditional recordings use their requested parent families', () => {
  assert.equal(byId.get('0qdMoqCqqmKo1V3NAuoWRM')?.genre_family, 'Pop');
  assert.equal(byId.get('2za4bmJGxNpMUkNAYp3SCs')?.genre_family, 'Country');
  assert.match(byId.get('2za4bmJGxNpMUkNAYp3SCs')?.genre_source ?? '', /batch-65/);
});

await test('batch 22 exact decisions preserve confidence and evidence metadata', () => {
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.confidence === 'high'));
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.evidence.length > 0));
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.rationale.length > 40));
});
