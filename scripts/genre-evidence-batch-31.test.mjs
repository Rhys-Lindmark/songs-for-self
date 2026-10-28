import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-31.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-31/'));

await test('batch 31 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 31 World placements retain named regional genre evidence', () => {
  for (const id of ['4kUCsQcJ1jkCK55pSD790b', '2hOyxeEIc59zZabHt6eF9p', '4zfSgk8S1mq8klntilxm1k', '5nYpzwdaQTf8WcesC8gizD', '2FGZDrcHRf9jGMHGPI8cjx']) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /cumbia|tropical|Islamic|Ramadan|Afro-Beat|Afro-Pop|Tamil/i);
  }
});

await test('adjacent-release evidence remains explicitly medium confidence', () => {
  assert.equal(decisions.tracks['4kUCsQcJ1jkCK55pSD790b'].confidence, 'medium');
});

await test('catalog soundtrack and genre mappings remain explicit', () => {
  assert.equal(decisions.tracks['0mWXrr6HQZUhCQG4JMkT2e'].family, 'Pop');
  assert.equal(decisions.tracks['772ZWxZ2wZgLwnkqRHPtw0'].confidence, 'medium');
  assert.equal(decisions.tracks['4lmuQUEuuIjHIPRXYGEojj'].family, 'Rock');
});
