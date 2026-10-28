import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-32.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-32/'));

await test('batch 32 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 32 keeps product mappings explicit', () => {
  assert.equal(decisions.tracks['0ityftvFzPVMrY1xqyrooH'].primary, 'Dance');
  assert.equal(decisions.tracks['0ityftvFzPVMrY1xqyrooH'].family, 'Electronic');
  assert.equal(decisions.tracks['5hUKXCwzPwnkvUjuhTykh9'].family, 'Electronic');
  assert.equal(decisions.tracks['1fWwxmWor6QbvBeLSV428F'].family, 'Rock');
  assert.equal(decisions.tracks['6tqTyRDxnT9bqOSdw5nmNF'].family, 'Hip-hop');
});

await test('African collaboration does not silently become World evidence', () => {
  const decision = decisions.tracks['2GlEeBVT9pTy2Kqoeq48dP'];
  assert.equal(decision.primary, 'House');
  assert.equal(decision.family, 'Electronic');
  assert.match(decision.rationale, /geography does not override/i);
});

await test('Clair de Lune retains work-level Classical evidence', () => {
  const decision = decisions.tracks['0BeN6CA7RuwNdJa64NV1l0'];
  assert.equal(decision.family, 'Classical');
  assert.equal(decision.evidence.length, 2);
  assert.match(decision.rationale, /Debussy work/i);
});
