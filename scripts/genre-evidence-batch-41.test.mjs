import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-41.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-41/'));

await test('batch 41 resolves ten exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 10);
  assert.equal(Object.keys(decisions.tracks).length, 10);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('official exact catalog genre fields map directly to requested parents', () => {
  assert.equal(decisions.tracks['5Og7LhaGMG7dx2dD9NWG7x'].family, 'Rock');
  assert.equal(decisions.tracks['7ncAGukC3NJMqRl7592fGR'].family, 'Hip-hop');
  assert.equal(decisions.tracks['5r9lr5HIk8twk42VLPRRU0'].family, 'Hip-hop');
  assert.equal(decisions.tracks['6eW6h9l8jqcH8CORFHpk6Z'].family, 'Electronic');
  assert.equal(decisions.tracks['1leRAYvAYOFhJAxsByuHCO'].family, 'Hip-hop');
});

await test('authored folk-punk recordings map to Modern Folk rather than Traditional Folk', () => {
  for (const id of ['5SINGDdmpCmyWBMGRCjXh0', '4lNFdOztkD3G3EfhcUDS8O']) {
    assert.equal(decisions.tracks[id].family, 'Modern Folk');
    assert.match(decisions.tracks[id].rationale, /authored/i);
  }
});

await test('artist- and release-adjacent calls remain visibly medium confidence', () => {
  for (const id of ['15qA7n35BvYG4F9spoBDrz', '35nDDEdIcwzqTCs6MBxUwk', '0CGlDDi5XXui5PowJedSXE']) assert.equal(decisions.tracks[id].confidence, 'medium');
});

await test('batch 41 does not infer World from geography', () => {
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
  assert.match(decisions.method, /no geographic identity is used as genre evidence/i);
});
