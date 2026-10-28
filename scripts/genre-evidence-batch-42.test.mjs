import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-42.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-42/'));

await test('batch 42 resolves ten exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 10);
  assert.equal(Object.keys(decisions.tracks).length, 10);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('exact or composition-addressable pop evidence maps to Pop', () => {
  for (const id of ['50rGPhuAvHSVEKFlrAkYdE', '1qZMyyaTyyJUjnfqtnmDdR', '5Yiwmn4PZAzVAms9UDICU2', '6uRFGL9F6ikcO9ZxnSyOB9']) assert.equal(decisions.tracks[id].family, 'Pop');
});

await test('contemporary authored folk stays distinct from Traditional Folk', () => {
  assert.equal(decisions.tracks['6abhwFoy77oliHqZuj1ShB'].family, 'Modern Folk');
  assert.match(decisions.tracks['6abhwFoy77oliHqZuj1ShB'].rationale, /authored/i);
});

await test('World placement requires positive named regional genre evidence', () => {
  const decision = decisions.tracks['5O29YWzqi5EC0y5G1aqLSj'];
  assert.equal(decision.family, 'World');
  assert.equal(decision.primary, 'Shilat');
  assert.match(decision.rationale, /not nationality/i);
  assert.match(decisions.method, /geographic identity alone is never genre evidence/i);
});

await test('adjacent and non-catalog evidence remains visibly medium confidence', () => {
  for (const [id, decision] of Object.entries(decisions.tracks)) {
    if (id !== '50rGPhuAvHSVEKFlrAkYdE' && id !== '5O29YWzqi5EC0y5G1aqLSj') assert.equal(decision.confidence, 'medium');
  }
});
