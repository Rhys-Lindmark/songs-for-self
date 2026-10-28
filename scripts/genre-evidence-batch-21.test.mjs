import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-21.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-21/'));

await test('batch 21 resolves 20 exact singleton tracks without broad propagation', () => {
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

await test('batch 21 World decisions retain positive regional or style evidence', () => {
  const expected = ['5CJzUZCwdJeET8ZRGopNsU', '5usBwZH590NBIuIGUm9BPs', '6vFtGl6zGGz3eqD6wEF9T2'];
  const byId = (left, right) => left.localeCompare(right);
  assert.deepEqual(reviewed.filter((row) => row.genre_family === 'World').map((row) => row.spotify_track_id).sort(byId), expected.sort(byId));
  assert.ok(reviewed.filter((row) => row.genre_family === 'World').every((row) => /international|world|andino|folklore|afro|amapiano|african/i.test(row.genre_evidence)));
});

await test('film score and traditional archive use their requested parent families', () => {
  assert.equal(reviewed.find((row) => row.spotify_track_id === '0GhZDx323AjdKIMuYP986o')?.genre_family, 'Pop');
  assert.equal(reviewed.find((row) => row.spotify_track_id === '1YlSbH3aLrOTfsKV8tNa26')?.genre_family, 'Traditional Folk');
});

await test('medium-confidence adjacent-release evidence remains track scoped', () => {
  const mediumIds = ['1mbWSa1cRORwXJtSQZrP2a', '2SKY9fnLJvVeumhID9wOk7', '2ohn5aD66Lk0rXZLyCCRyH'];
  assert.ok(mediumIds.every((id) => decisions.tracks[id].confidence === 'medium'));
  assert.ok(mediumIds.every((id) => reviewed.find((row) => row.spotify_track_id === id)?.genre_source.endsWith(`/track/${id}`)));
});
