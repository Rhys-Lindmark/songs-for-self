import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-57.json', root), 'utf8'));
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-57/'));

await test('batch 57 repairs the eight Clash recording-family false positives', () => {
  assert.equal(Object.keys(decisions.albums).length, 4);
  assert.equal(reviewed.length, 8);
  assert.ok(reviewed.every((row) => row.artist_names === 'The Clash'));
  assert.ok(reviewed.every((row) => row.genre_family === 'Rock' && row.genre_primary === 'Punk rock'));
});

await test('Clash corrections reject the unsupported World placement explicitly', () => {
  assert.ok(Object.values(decisions.albums).every((decision) => decision.evidence.some((source) => source.includes('everynoise.com'))));
  assert.ok(Object.values(decisions.albums).every((decision) => /World/.test(decision.rationale)));
  assert.ok(reviewed.every((row) => row.genre_evidence.includes('Reggae') || row.genre_evidence.includes('reggae')));
});
