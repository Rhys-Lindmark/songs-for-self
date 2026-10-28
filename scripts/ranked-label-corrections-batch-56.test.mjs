import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-56.json', root), 'utf8'));
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-56/'));

await test('batch 56 repairs 32 primary-artist rows with album or exact-track scope', () => {
  assert.equal(reviewed.length, 32);
  assert.equal(Object.keys(decisions.albums).length, 16);
  assert.equal(Object.keys(decisions.tracks).length, 2);
  assert.equal(reviewed.filter((row) => row.artist_names.split(';')[0] === 'Kendrick Lamar').length, 18);
  assert.equal(reviewed.filter((row) => row.artist_names.split(';')[0] === 'Johnny Cash').length, 12);
  assert.equal(reviewed.filter((row) => row.artist_names.split(';')[0] === 'Bob Dylan').length, 2);
});

await test('Kendrick guest appearances on other artists releases remain untouched', () => {
  const guestIds = ['4XoP1AkbOurU9CeZ2rMEz2', '6vtX4NqMcQdViQSk0eGYdE', '69yfbpvmkIaB10msnKT7Q5', '7HetWRCNDPHhiksK6VrAG1'];
  assert.ok(guestIds.every((id) => !rows.find((row) => row.spotify_track_id === id)?.genre_source.includes('batch-56')));
});

await test('specific ranked labels now beat generic crossover labels', () => {
  assert.equal(rows.find((row) => row.spotify_track_id === '2zz8599zFWbCxlapmnWeAQ')?.genre_family, 'Hip-hop');
  assert.equal(rows.find((row) => row.spotify_track_id === '28cnXtME493VX9NOw9cIUh')?.genre_family, 'Country');
  assert.equal(rows.find((row) => row.spotify_track_id === '3RkQ3UwOyPqpIiIvGVewuU')?.genre_family, 'Modern Folk');
  assert.equal(rows.find((row) => row.spotify_track_id === '4uYwlMp841PLJmj1gJJwIq')?.genre_family, 'Country');
});
