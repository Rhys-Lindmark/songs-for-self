import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVisitorGenreSpace } from '../lib/visitor-genre-space.ts';

const atlas = {
  projection: { name: 'Editorial genre space', modelVersion: 'genre-space-v1', method: 'Deterministic editorial layout; not a measured acoustic quantity.', axes: ['semantic x', 'semantic y'], reproducibleFrom: ['genre_family'] },
  summary: { tracks: 2, families: 2, clusters: 2, artists: 2, albumCovers: 1 },
  families: [
    { family: 'Electronic', x: 0.2, y: 0.3, color: '#168e80', count: 1 },
    { family: 'Hip-hop', x: 0.8, y: 0.7, color: '#df7625', count: 1 },
    { family: 'World', x: 0.4, y: 0.6, color: '#548b46', count: 0 },
  ],
  clusters: [],
  artists: [
    { id: 'artist-panama', family: 'Electronic', label: 'Panama Wedding', spotifyArtistId: 'artist-id', count: 1, x: 0.22, y: 0.31 },
    { id: 'artist-nico', family: 'Hip-hop', label: 'Nico Segal', spotifyArtistId: null, count: 1, x: 0.78, y: 0.69 },
  ],
  albums: { album1: { coverUrl: 'https://example.com/cover', coverSource: 'Cover Art Archive', coverSourceId: 'rg1' } },
  points: [
    { id: '1234567890123456789012', title: 'Sunday Candy', artists: 'Nico Segal; Chance the Rapper', spotifyArtistIds: [], album: 'Surf', spotifyAlbumId: 'album1', family: 'Hip-hop', primary: 'Chicago hip hop', secondary: '', x: 0.79, y: 0.7, confidence: 'high', source: 'fixture', method: 'source tag', estimated: false },
    { id: 'ABCDEFGHIJKLmnopqrstuv', title: 'All of the People', artists: 'Panama Wedding', spotifyArtistIds: ['artist-id'], album: 'Parallel Play', spotifyAlbumId: null, family: 'Electronic', primary: 'indietronica', secondary: '', x: 0.21, y: 0.32, confidence: 'high', source: 'fixture', method: 'source tag', estimated: false },
  ],
};

const tracks = [
  { spotifyTrackId: '1234567890123456789012', track: 'Sunday Candy', artist: 'Nico Segal', year: 2013, genre: 'Hip-hop', x: null, y: null, city: '', country: '', method: 'exact track' },
  { spotifyTrackId: null, track: 'A New Panama Song', artist: 'Panama Wedding', year: 2014, genre: 'Electronic', x: null, y: null, city: '', country: '', method: 'artist inference' },
  { spotifyTrackId: null, track: 'Unknown House Song', artist: 'Unknown Producer', year: 2020, genre: 'Electronic', x: null, y: null, city: '', country: '', method: 'uploaded metadata' },
  { spotifyTrackId: null, track: 'Known Beyond This Playlist', artist: 'Global Artist', year: 2021, genre: 'World', genreSpaceX: 0.34, genreSpaceY: 0.58, genreSpacePrimary: 'spanish folk', genreSpaceGenres: ['spanish folk', 'medieval folk'], genreSource: 'https://noteverynoise.com/genre.html', x: null, y: null, city: '', country: '', method: 'artist inference' },
  { spotifyTrackId: null, track: 'Mystery', artist: 'Unknown', year: null, genre: 'Other', x: null, y: null, city: '', country: '', method: 'fallback' },
];

await test('reuses exact points, artist centroids, and explicit family fallbacks without inventing unresolved tracks', () => {
  const result = buildVisitorGenreSpace(tracks, atlas);
  assert.equal(result.exactTracks, 1);
  assert.equal(result.artistCentroids, 2);
  assert.equal(result.familyFallbacks, 1);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.payload.summary.tracks, 4);
  assert.equal(result.payload.families.reduce((sum, family) => sum + family.count, 0), 4);
  assert.equal(new Set(result.payload.points.map((point) => point.id)).size, 4);
  assert.ok(result.payload.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  assert.match(result.payload.points[1].method, /artist-centroid/);
  assert.match(result.payload.points[2].method, /family-centroid fallback/);
  assert.equal(result.payload.points[2].confidence, 'low');
  assert.match(result.payload.points[3].method, /sourced artist-genre centroid/);
  assert.equal(result.payload.points[3].primary, 'spanish folk');
  assert.equal(result.payload.points[0].spotifyTrackId, '1234567890123456789012');
});

await test('visitor fallback coordinates are deterministic and retain album-cover provenance only for matched albums', () => {
  const first = buildVisitorGenreSpace(tracks, atlas);
  const second = buildVisitorGenreSpace(tracks, atlas);
  assert.deepEqual(first.payload.points, second.payload.points);
  assert.deepEqual(first.payload.albums, atlas.albums);
  assert.match(first.payload.projection.method, /visibly labeled family-centroid fallbacks/i);
});
