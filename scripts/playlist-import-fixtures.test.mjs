import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyzePlaylistRows, parseCsv } from '../lib/playlist-analyzer.ts';

const fixtureDirectory = fileURLToPath(new URL('./fixtures/playlist-imports/', import.meta.url));
const exactTrack = {
  id: '1234567890123456789012', key: 'sunday candy|nico segal', track: 'Sunday Candy', artist: 'Nico Segal; Chance the Rapper',
  year: 2013, genre: 'Hip-hop', x: 268.3, y: 188.2, city: 'Chicago', country: 'United States',
};
const lookup = { tracks: [exactTrack], artists: [] };

function importFixture(name) {
  return analyzePlaylistRows(parseCsv(readFileSync(`${fixtureDirectory}${name}.csv`, 'utf8')), lookup);
}

await test('imports a Spotify playlist export by Track URI', () => {
  const [track] = importFixture('spotify');
  assert.deepEqual(track, {
    ...exactTrack, spotifyTrackId: exactTrack.id, method: 'exact track',
    genreSource: 'Songs for Self exact-track enrichment', genreConfidence: 'medium',
    timeSource: 'Songs for Self exact-track enrichment', timeConfidence: 'medium',
    geographySource: 'Songs for Self exact-track enrichment', geographyConfidence: 'medium',
  });
});

await test('imports Exportify columns and detailed artist genres', () => {
  const [track] = importFixture('exportify');
  assert.equal(track.track, 'All of the People');
  assert.equal(track.artist, 'Panama Wedding');
  assert.equal(track.year, 2014);
  assert.equal(track.genre, 'Electronic');
  assert.equal(track.method, 'uploaded metadata');
});

await test('imports Soundiiz title, artist, and genre columns', () => {
  const [track] = importFixture('soundiiz');
  assert.equal(track.track, 'Dreams');
  assert.equal(track.artist, 'The Cranberries');
  assert.equal(track.genre, 'Rock');
  assert.equal(track.year, null);
});

await test('imports Apple Music name, release date, and genre columns', () => {
  const [track] = importFixture('apple-music');
  assert.equal(track.track, 'Blue in Green');
  assert.equal(track.artist, 'Miles Davis');
  assert.equal(track.genre, 'Jazz');
  assert.equal(track.year, 1959);
});

await test('imports a generic CSV with explicit geography', () => {
  const [track] = importFixture('generic');
  assert.equal(track.genre, 'Electronic');
  assert.equal(track.year, 2008);
  assert.equal(track.city, 'Berlin');
  assert.equal(track.country, 'Germany');
  assert.ok(track.x > 530 && track.x < 550);
  assert.ok(track.y > 100 && track.y < 120);
});
