import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-43.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-43/'));

await test('batch 43 resolves ten exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 10);
  assert.equal(Object.keys(decisions.tracks).length, 10);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('exact rap and rock sources map directly to requested parents', () => {
  assert.equal(decisions.tracks['1F40SL50tBiuvMarnspS5p'].family, 'Hip-hop');
  assert.equal(decisions.tracks['2gZYqE0nJr9GZ8b7tDpoTY'].family, 'Hip-hop');
  assert.equal(decisions.tracks['4hMOj8OE1k8vikua4IGigA'].family, 'Rock');
  assert.equal(decisions.tracks['6lc9HvmHs24kbClunI2KCf'].family, 'Rock');
});

await test('World placements retain positive regional and editorial genre evidence', () => {
  for (const id of ['4yQI1CEZ8Qz95FusJ19H23', '7EMxaa8V5EbqAmcM4GbTPS']) {
    assert.equal(decisions.tracks[id].family, 'World');
    assert.match(decisions.tracks[id].rationale, /positive|fusion/i);
  }
  assert.match(decisions.method, /geography alone is never genre evidence/i);
});

await test('official compilation evidence recovers the missing Guragigna artist identity', () => {
  const row = reviewed.find((item) => item.spotify_track_id === '7EMxaa8V5EbqAmcM4GbTPS');
  assert.equal(row.artist_names, 'Dub Colossus');
  assert.match(row.notes, /identity recovered editorially/i);
});

await test('Arabic boy-band pop does not become World from language or member identity', () => {
  assert.equal(decisions.tracks['6xUOAOJPQW3Qj0Lap8K4yo'].family, 'Pop');
  assert.match(decisions.tracks['6xUOAOJPQW3Qj0Lap8K4yo'].rationale, /do not create a World assignment/i);
});

await test('artist- and product-adjacent calls remain visibly medium confidence', () => {
  for (const id of ['0wh2YLhRJbWW6yQZd0Hokq', '1AhXYWEf1U265qiUvz1EbW', '3VQ955Eo5g8bi442lerau3']) assert.equal(decisions.tracks[id].confidence, 'medium');
});
