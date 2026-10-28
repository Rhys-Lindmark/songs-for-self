import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-33.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-33/'));

await test('batch 33 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 33 maps store subgenres to requested parents', () => {
  assert.equal(decisions.tracks['5tcWyP7QtLckq0etobpMGQ'].family, 'Electronic');
  assert.equal(decisions.tracks['6ZggbadfniXdQLNkUDp8aT'].family, 'Rock');
  assert.equal(decisions.tracks['2xmpsCAz0aSNRkqdm2Yiqc'].family, 'Modern Folk');
  assert.equal(decisions.tracks['6XuJcZEIFFq4RhFM7iHKSt'].family, 'Rock');
});

await test('recording evidence outranks titles, source melodies, and nationality', () => {
  assert.equal(decisions.tracks['1qIPueQ2jkLrdPi8sOayDU'].family, 'Pop');
  assert.match(decisions.tracks['1qIPueQ2jkLrdPi8sOayDU'].rationale, /source melody does not override/i);
  assert.equal(decisions.tracks['3LF2fFWYnCj8el96qH9gL1'].family, 'Rock');
  assert.match(decisions.tracks['3LF2fFWYnCj8el96qH9gL1'].rationale, /nationality is not used/i);
});

await test('batch 33 introduces no unsupported World assignments', () => {
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
});
