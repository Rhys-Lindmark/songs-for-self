import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-36.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-36/'));

await test('batch 36 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 36 World placements retain named positive evidence', () => {
  for (const id of ['01CrqrUGOfgJSLjeHTyO1C', '1fLI4vUr6ludtI1lbpLHw6', '6RBph39HU1HKJruii8FSLg']) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /Mexicana|Worldbeat|Indian|mantra/i);
  }
});

await test("soundtrack and children's products map explicitly to Pop", () => {
  for (const id of ['0ClgwgBbok62NjS6iWxY4p', '749a3IktgztaKcRg3zmQvv', '4NrLefenIbzmro9Z28KK62', '1dwTG4PVhiWzeu0fUfMMMb']) {
    assert.equal(decisions.tracks[id].family, 'Pop');
  }
});

await test('source melody does not override exact Classical performance evidence', () => {
  const decision = decisions.tracks['42vr5N0oPoMvECTW6ryoWD'];
  assert.equal(decision.family, 'Classical');
  assert.match(decision.rationale, /source melody does not override/i);
});
