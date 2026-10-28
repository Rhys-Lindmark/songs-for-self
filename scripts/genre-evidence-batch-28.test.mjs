import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-28.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-28/'));

await test('batch 28 retains twenty decisions while two active placements are superseded by later exact-track evidence', () => {
  assert.equal(reviewed.length, 18);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.equal(rows.find((row) => row.spotify_track_id === '7vt7cUdUhOce1aYrULANus')?.genre_source, 'editorial:genre-evidence-batch-49/track/7vt7cUdUhOce1aYrULANus');
  assert.equal(rows.find((row) => row.spotify_track_id === '0mRLSzS6ugu1mUxJPCCPjl')?.genre_source, 'editorial:genre-evidence-batch-68/track/0mRLSzS6ugu1mUxJPCCPjl');
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 28 keeps catalog mappings explicit and track scoped', () => {
  const mediumIds = ['2XPhfOHfqwYJDR9SEa6EkO', '3SG7qTmJW8T2BijkfP6HBK'];
  assert.ok(mediumIds.every((id) => decisions.tracks[id].confidence === 'medium'));
  assert.ok(reviewed.every((row) => decisions.tracks[row.spotify_track_id]));
});

await test('batch 28 World placement requires named repertoire evidence', () => {
  const heat = decisions.tracks['03ROTiQnCq4QXXpl3Sf4jh'];
  assert.equal(heat.family, 'World');
  assert.match(`${heat.primary} ${heat.secondary} ${heat.rationale}`, /didjeridu|Indigenous Australian/i);
  assert.ok(heat.evidence.some((url) => url.includes('worldmusiccentral.org')));
});

await test('batch 28 preserves distinct folk, jazz, and regional pop parents', () => {
  assert.equal(decisions.tracks['1qn7yKzOEDAkvQo5oV1hEz'].family, 'Traditional Folk');
  assert.equal(decisions.tracks['2IQD1ZV1ItCMIuRPFUh9JE'].family, 'Jazz');
  assert.equal(decisions.tracks['3IyHwSzuzUZq0a4VLbAB2l'].family, 'Pop');
});
