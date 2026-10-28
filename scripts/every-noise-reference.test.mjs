import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildReferenceIndex, placeTrackInEveryNoise } from '../lib/every-noise-placement.mjs';

const reference = JSON.parse(fs.readFileSync(new URL('../data/every-noise-reference-2023.json', import.meta.url), 'utf8'));
const index = buildReferenceIndex(reference);

await test('pinned Every Noise reference retains provenance and exact coordinate bounds', () => {
  assert.equal(reference.referenceVersion, '2023-12-04');
  assert.equal(reference.genreCount, 6291);
  assert.equal(reference.publicMirrorCommit, 'e80265defc743b307586ac0a7a5c72d2dacdf409');
  assert.equal(index.size, reference.genreCount);
  assert.ok(reference.genres.every((genre) => genre.genre && genre.key && genre.x >= 0 && genre.x <= 1 && genre.y >= 0 && genre.y <= 1));
  assert.deepEqual(index.get('techno'), { genre: 'techno', key: 'techno', left: 1180, top: 1048, x: 0.786667, y: 0.046273 });
  assert.deepEqual(index.get('classical'), { genre: 'classical', key: 'classical', left: 380, top: 21730, x: 0.253333, y: 0.959467 });
});

await test('reference topology preserves recognizable musical neighborhoods', () => {
  assert.ok(distance('techno', 'house') < distance('techno', 'bluegrass'));
  assert.ok(distance('baroque', 'classical') < distance('baroque', 'baroque pop'));
  assert.ok(distance('bebop', 'jazz') < distance('bebop', 'country'));
});

await test('track placement uses exact genres, centroids, aliases, then explicit family fallback', () => {
  const exact = placeTrackInEveryNoise({ genre_primary: 'techno', genre_secondary: '', genre_family: 'Electronic' }, index);
  assert.equal(exact.method, 'every-noise-exact-genre');
  assert.deepEqual(exact.referenceGenres, ['techno']);
  assert.equal(exact.x, index.get('techno').x);

  const centroid = placeTrackInEveryNoise({ genre_primary: 'techno', genre_secondary: 'house', genre_family: 'Electronic' }, index);
  assert.equal(centroid.method, 'every-noise-genre-centroid');
  assert.deepEqual(centroid.referenceGenres, ['techno', 'house']);

  const alias = placeTrackInEveryNoise({ genre_primary: 'electronic music', genre_secondary: '', genre_family: 'Electronic' }, index);
  assert.equal(alias.method, 'every-noise-exact-genre');
  assert.deepEqual(alias.referenceGenres, ['electronica']);

  const fallback = placeTrackInEveryNoise({ genre_primary: 'unavailable catalog recording', genre_secondary: '', genre_family: 'Jazz' }, index);
  assert.equal(fallback.method, 'every-noise-family-reference-centroid');
  assert.equal(fallback.referenceMatchCount, 0);
  assert.deepEqual(fallback.referenceGenres, ['jazz']);

  const artistMemberships = new Map([['artist-1', { genres: ['downtempo', 'trip hop'], sourcePages: ['https://noteverynoise.com/downtempo.html'] }]]);
  const artist = placeTrackInEveryNoise({ genre_primary: 'unavailable catalog recording', genre_secondary: '', genre_family: 'Electronic', spotify_artist_ids: 'artist-1' }, index, artistMemberships);
  assert.equal(artist.method, 'every-noise-artist-membership-centroid');
  assert.deepEqual(artist.referenceGenres, ['downtempo', 'trip hop']);
  assert.deepEqual(artist.referenceSource, ['https://noteverynoise.com/downtempo.html']);

  const catalogMemberships = new Map([['Archive Artist', { genres: ['qawwali'], sourcePages: ['https://musicbrainz.org/artist/example'] }]]);
  const catalog = placeTrackInEveryNoise({ genre_primary: 'unavailable catalog recording', genre_secondary: '', genre_family: 'World', artist_names: 'Archive Artist' }, index, new Map(), catalogMemberships);
  assert.equal(catalog.method, 'every-noise-catalog-artist-genre-centroid');
  assert.deepEqual(catalog.referenceGenres, ['qawwali']);
});

function distance(left, right) {
  const a = index.get(left);
  const b = index.get(right);
  return Math.hypot(a.x - b.x, a.y - b.y);
}
