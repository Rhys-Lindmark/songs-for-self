import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-58.json', root), 'utf8'));
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-58/'));

await test('batch 58 repairs six source-backed Pop recordings', () => {
  assert.equal(Object.keys(decisions.albums).length, 4);
  assert.equal(reviewed.length, 6);
  assert.equal(reviewed.filter((row) => row.artist_names === 'ABBA').length, 3);
  assert.equal(reviewed.filter((row) => row.artist_names === 'Jessie Ware').length, 3);
  assert.ok(reviewed.every((row) => row.genre_family === 'Pop' && row.genre_confidence === 'high'));
});

await test('batch 58 uses exact release and first-party or official-store evidence', () => {
  assert.ok(Object.values(decisions.albums).every((decision) => decision.evidence.some((source) => source.includes('open.spotify.com/album/'))));
  assert.ok(Object.values(decisions.albums).every((decision) => decision.evidence.some((source) => /abbasite\.com|music\.apple\.com|universalmusic\.it/.test(source))));
  assert.ok(reviewed.every((row) => /disco|dance|pop|soul/i.test(row.genre_secondary)));
});
