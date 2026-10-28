import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-34.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-34/'));

await test('batch 34 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 34 World placements retain positive named regional evidence', () => {
  for (const id of ['2n3TIdIXujwIEsyaOVHshS', '5ksK00kEBRG4yN4jD74IFV']) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /Khaleeji|Arabic|Egyptian/i);
  }
});

await test('product and crossover mappings remain explicit', () => {
  assert.equal(decisions.tracks['6nD9vd91Zs4kZH6JwWWBwf'].family, 'Pop');
  assert.equal(decisions.tracks['05ONWfZsHUmcPSntAZrxHM'].confidence, 'medium');
  assert.equal(decisions.tracks['6O7DiDhXicGVAFB2uyIMBO'].family, 'Modern Folk');
  assert.equal(decisions.tracks['1zCgiNXncrOEsUKaN0Dphs'].confidence, 'medium');
});

await test('recording evidence controls Gurkha band performance placement', () => {
  const decision = decisions.tracks['3k7jhH4KmOK7OBwaQoiFEG'];
  assert.equal(decision.family, 'Classical');
  assert.match(decision.rationale, /recording evidence controls/i);
});
