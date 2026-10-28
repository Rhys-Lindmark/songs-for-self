import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-35.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-35/'));

await test('batch 35 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 35 World placement retains named qawwali evidence', () => {
  const decision = decisions.tracks['4xc3i2uDO9uFK7uCceizFV'];
  assert.equal(decision.family, 'World');
  assert.match(`${decision.primary} ${decision.rationale}`, /Qawwali|Qawwal/i);
});

await test('authored folk and traditional repertoire remain distinct', () => {
  assert.equal(decisions.tracks['3D8eLXeiro2UxhJUgij7PP'].family, 'Modern Folk');
  assert.equal(decisions.tracks['2cvIl7GXDep3zrtoASASjW'].family, 'Traditional Folk');
  assert.equal(decisions.tracks['2XgO7vVKKNcxAixmQ4kMyd'].family, 'Traditional Folk');
  assert.equal(decisions.tracks['5Kqq0j1BfJTVdVaMRGfS2t'].family, 'Modern Folk');
});

await test('regional identity does not override exact recording evidence', () => {
  assert.equal(decisions.tracks['2TgLPHu6EGAWYj5dpoFEXH'].family, 'Rock');
  assert.match(decisions.tracks['2TgLPHu6EGAWYj5dpoFEXH'].rationale, /regional identity does not override/i);
});
