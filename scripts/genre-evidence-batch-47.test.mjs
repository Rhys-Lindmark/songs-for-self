import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-47.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-47/'));

await test('batch 47 corrects exactly twenty source-addressable tracks without artist propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  assert.ok(reviewed.every((row) => row.genre_confidence === 'medium'));
});

await test('every correction retains exact-track and genre-reference URLs', () => {
  for (const [id, decision] of Object.entries(decisions.tracks)) {
    assert.equal(decision.action, 'correct');
    assert.ok(decision.evidence.includes(`https://open.spotify.com/track/${id}`));
    assert.ok(decision.evidence.some((url) => url.startsWith('https://noteverynoise.com/')));
  }
});

await test('obvious keyword failures now use the evidence-backed family', () => {
  const byId = new Map(rows.map((row) => [row.spotify_track_id, row]));
  for (const id of ['4IUgpL0CgSiloUOHzgd6Qe', '5x823Kkxfwzs8d6mLgGk6y', '2oq7Sgj2B3gocUBRlHIvLN', '5Z5fBGwWP4x0mYCmchLpc1']) assert.equal(byId.get(id).genre_family, 'Electronic');
  for (const id of ['2MlV4hyxUgN9zjFUqWvWFb', '0VuzA7lyIFn1VzinsOak8J']) assert.equal(byId.get(id).genre_family, 'Hip-hop');
  for (const id of ['6Nv8dfTm2qMjJeP7OL3hO7', '7bWhtFDDMgcA6DmFGGlS0C']) assert.equal(byId.get(id).genre_family, 'R&B, Soul & Blues');
});

await test('the correction batch does not infer World or alter the top-level taxonomy', () => {
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
  assert.deepEqual([...new Set(rows.filter((row) => row.spotify_track_id).map((row) => row.genre_family))].sort((left, right) => left.localeCompare(right)), ['Classical', 'Country', 'Electronic', 'Experimental', 'Hip-hop', 'Jazz', 'Modern Folk', 'Pop', 'R&B, Soul & Blues', 'Rock', 'Traditional Folk', 'World']);
});
