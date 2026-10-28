import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-24.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-24/'));

await test('batch 24 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('World decisions require positive named regional or traditional evidence', () => {
  const worldIds = ['3MBojR9V9eUGAnM3cuWruq', '3diGKhBW2E7ewWP2D0Fm2n', '5DUOe5FU7nZGFKtOXTrrq3', '3uo09WQ1gXXiB8icYbuI2b', '3ZMkCOpMO9EFk5gpakn2Ss', '6wOfLFGg2DB9IHDrytCTlY'];
  for (const id of worldIds) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /African|Highlife|Moroccan|Thai|Kurdish|Anatolian|Bulgarian|Kerala|Indian|regional|traditional/i);
    assert.doesNotMatch(decision.rationale, /artist is from|nationality alone|geography alone/i);
  }
});

await test('requested-family product mappings stay documented', () => {
  assert.equal(decisions.tracks['5KpQubvRCZ73EDKGHVJu0J'].family, 'Pop');
  assert.match(decisions.tracks['5KpQubvRCZ73EDKGHVJu0J'].rationale, /requested-family|product/i);
  assert.equal(decisions.tracks['4xm2HjtDAdCobewPoaImT7'].family, 'R&B, Soul & Blues');
  assert.match(decisions.tracks['4xm2HjtDAdCobewPoaImT7'].rationale, /requested taxonomy/i);
});

await test('ambiguous crossover calls retain medium confidence', () => {
  for (const id of ['7CjEs2mTR1d0397dJL0NXZ', '5DUOe5FU7nZGFKtOXTrrq3']) {
    assert.equal(decisions.tracks[id].confidence, 'medium');
    assert.equal(reviewed.find((row) => row.spotify_track_id === id)?.genre_confidence, 'medium');
  }
});
