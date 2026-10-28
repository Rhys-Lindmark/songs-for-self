import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-29.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-29/'));

await test('batch 29 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 29 World placements retain positive named repertoire evidence', () => {
  for (const id of ['0e2ItMNi3Ghdh3RCduE3Xm', '3ctNGp0xEZbOXQ0N0ORL2I']) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /Hindustani|raga|nasheed|Islamic/i);
  }
});

await test('Arabic pop remains Pop instead of becoming World from language or origin', () => {
  assert.equal(decisions.tracks['55HS624LYOCR3QwOUxWbMJ'].family, 'Pop');
  assert.match(decisions.tracks['55HS624LYOCR3QwOUxWbMJ'].rationale, /Pop/);
});

await test('novelty product mapping remains explicit and medium confidence', () => {
  const novelty = decisions.tracks['777aG0vrgJe2302rgPAmht'];
  assert.equal(novelty.family, 'Pop');
  assert.equal(novelty.confidence, 'medium');
});
