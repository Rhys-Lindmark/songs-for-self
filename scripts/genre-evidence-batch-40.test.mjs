import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-40.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-40/'));

await test('batch 40 resolves ten exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 10);
  assert.equal(Object.keys(decisions.tracks).length, 10);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('Aka repertoire has positive regional and traditional evidence', () => {
  const decision = decisions.tracks['6YcESpKGPqMkfMwwFjZxmy'];
  assert.equal(decision.family, 'World');
  assert.match(decision.rationale, /positive named regional and repertoire evidence/i);
  assert.ok(decision.evidence.some((url) => url.includes('ethnomusicologie')));
});

await test('pseudo-Japanese concept does not turn European pop into World', () => {
  const decision = decisions.tracks['2k0zYwTDDAjWBrzeJSyRXV'];
  assert.equal(decision.family, 'Pop');
  assert.match(decision.rationale, /does not make.*World/i);
});

await test('release-adjacent mappings remain explicitly medium confidence', () => {
  for (const id of ['2fcGWyPm2u74ij6HKzyvf5', '2IGRVqwmbr9uEPAFP5kNAa', '0uYtNddmkSnAcJemDCEgan']) {
    assert.equal(decisions.tracks[id].confidence, 'medium');
  }
});

await test('official exact genre fields map directly to requested parents', () => {
  assert.equal(decisions.tracks['6WaogiItGdUTm490XN4QKJ'].family, 'Hip-hop');
  assert.equal(decisions.tracks['55xieoYrDWRuXC2T2r0CoX'].family, 'Hip-hop');
  assert.equal(decisions.tracks['0D1lgFbxCMU4aieSJWSy9H'].family, 'Electronic');
});
