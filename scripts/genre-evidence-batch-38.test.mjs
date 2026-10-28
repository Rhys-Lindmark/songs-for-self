import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';
const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-38.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-38/'));

await test('batch 38 resolves 16 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 16);
  assert.equal(Object.keys(decisions.tracks).length, 16);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('World and Traditional Folk decisions retain positive genre evidence', () => {
  assert.match(decisions.tracks['70gc902jBFvMOnMLzUrUNU'].rationale, /positive named regional evidence/i);
  assert.match(decisions.tracks['48NGSevwr99F28ju91F15Q'].rationale, /positive named genre/i);
  assert.match(decisions.tracks['4kcctaN2cZf1yaJtq1rMBC'].rationale, /positive named traditional-folk evidence/i);
});

await test('broad or interpretive catalog mappings stay explicitly medium confidence', () => {
  assert.equal(decisions.tracks['6SI5uPPhdQBdbvgvp2SD34'].confidence, 'medium');
  assert.equal(decisions.tracks['2YfZBomGm5Ff4GpJ7Dha9k'].confidence, 'medium');
});

await test('German Pop does not become World from language or origin', () => {
  assert.equal(decisions.tracks['1DnJudg70kVXdUaIsUL4ND'].family, 'Pop');
  assert.match(decisions.tracks['1DnJudg70kVXdUaIsUL4ND'].rationale, /do not turn pop into World/i);
});
