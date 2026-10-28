import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-20.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-20/'));

await test('batch 20 resolves 20 exact singleton tracks without broad propagation', () => {
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

await test('batch 20 World decisions retain positive regional or style evidence', () => {
  const expected = ['0vE1V3Y53gWBRlyfVqlN7e', '4iwiYqzoLImJraKQ9Pf2I2', '5QUs71n3gj6zVLCpUjFveY', '75pljU6SIhciJ2PYqGbvvK', '7K3oLzzyd5lZrCgMSxxa9Y'];
  const byId = (left, right) => left.localeCompare(right);
  assert.deepEqual(reviewed.filter((row) => row.genre_family === 'World').map((row) => row.spotify_track_id).sort(byId), expected.sort(byId));
  assert.ok(reviewed.filter((row) => row.genre_family === 'World').every((row) => /hawai|malawi|afro|amapiano|per[uú]|thai|world/i.test(row.genre_evidence)));
});

await test('authored and traditional folk remain distinct', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '7jEVW8o2CIfdgziEJXnii8')?.genre_family, 'Modern Folk');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '1SixVVMFW4IJMhiO5d3rfm')?.genre_family, 'Traditional Folk');
});

await test('funk maps to the requested R&B Soul and Blues parent', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '6LespxoKOQwks21m3rHwst')?.genre_family, 'R&B, Soul & Blues');
});
