import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregatePlaces, aggregateTimeline, analyzePlaylistRows, classifyGenre, parseCsv } from '../lib/playlist-analyzer.ts';

const exactTrack = {
  id: '1234567890123456789012',
  key: 'sunday candy|nico segal',
  track: 'Sunday Candy',
  artist: 'Nico Segal; Chance the Rapper',
  year: 2013,
  genre: 'Hip-hop',
  x: 268.3,
  y: 188.2,
  city: 'Chicago',
  country: 'United States',
  genreSource: 'fixture:genre', genreConfidence: 'high', timeSource: 'fixture:time', timeConfidence: 'high', geographySource: 'fixture:place', geographyConfidence: 'high',
};

const lookup = {
  tracks: [exactTrack],
  artists: [{ key: 'panama wedding', name: 'Panama Wedding', genre: 'Electronic', year: 2014, x: 289, y: 190, city: 'New York', country: 'United States' }],
};

const globalGenreIndex = {
  schemaVersion: 1,
  sourceName: 'Not Every Noise at Once',
  sourceUrl: 'https://noteverynoise.com/',
  sourceModel: 'fixture',
  referenceUrl: 'https://example.com/reference',
  artists: [{ id: 'abcdefghijklmnopqrstUV', key: 'efren lopez', name: 'Efrén López', family: 'World', primary: 'spanish folk', genres: ['spanish folk', 'medieval folk'], x: 0.31, y: 0.62, method: 'every-noise-membership + taxonomy label', sourceUrl: 'https://noteverynoise.com/engenremap-spanishfolk.html' }],
};

await test('preserves imported album artwork alongside exact genre evidence and unknown tracks', () => {
  const metadata = { 'Album Name': 'Surf', 'Album ID': 'ABCDEFGHIJKLMNOPQRSTUV', 'Image URL': 'https://i.scdn.co/image/test-cover' };
  const [exact, unknown] = analyzePlaylistRows([
    { ...metadata, 'Track URI': 'spotify:track:1234567890123456789012' },
    { ...metadata, 'Track Name': 'New song', Artist: 'New artist' },
  ], lookup);
  for (const track of [exact, unknown]) {
    assert.equal(track.album, 'Surf');
    assert.equal(track.spotifyAlbumId, 'ABCDEFGHIJKLMNOPQRSTUV');
    assert.equal(track.coverUrl, metadata['Image URL']);
  }
  assert.equal(exact.genre, 'Hip-hop');
  assert.equal(unknown.genre, 'Other');
});

await test('parses BOM, CRLF, quoted commas, embedded newlines, and escaped quotes', () => {
  const rows = parseCsv('\uFEFFTrack Name,Artist Name,Notes\r\n"Song, One","Artist ""A""","line one\nline two"\r\n');
  assert.deepEqual(rows, [{ 'Track Name': 'Song, One', 'Artist Name': 'Artist "A"', Notes: 'line one\nline two' }]);
});

await test('matches an exact Spotify track URI and reuses complete enrichment', () => {
  const [track] = analyzePlaylistRows([{ 'Track Name': 'Anything', Artist: 'Anyone', 'Track URI': 'spotify:track:1234567890123456789012' }], lookup);
  assert.deepEqual(track, { ...exactTrack, spotifyTrackId: exactTrack.id, method: 'exact track' });
});

await test('matches normalized track and primary artist when an ID is absent', () => {
  const [track] = analyzePlaylistRows([{ title: '  Sunday Candy ', artists: 'Nico Ségal; Chance the Rapper' }], lookup);
  assert.equal(track.method, 'exact track');
  assert.equal(track.genre, 'Hip-hop');
});

await test('uses known artist evidence when the uploaded row has no metadata', () => {
  const [track] = analyzePlaylistRows([{ Name: 'All of the People', 'Artist Name(s)': 'Panama Wedding' }], lookup);
  assert.deepEqual(track, {
    spotifyTrackId: null, track: 'All of the People', artist: 'Panama Wedding', year: 2014, genre: 'Electronic', x: 289, y: 190,
    city: 'New York', country: 'United States', method: 'artist inference',
    genreSource: 'Songs for Self artist catalog inference', genreConfidence: 'low', timeSource: 'Songs for Self artist catalog inference', timeConfidence: 'low', geographySource: 'Songs for Self artist catalog inference', geographyConfidence: 'low',
  });
});

await test('prefers supplied year, genre, and coordinates for an unknown artist', () => {
  const [track] = analyzePlaylistRows([{
    track_name: 'Unknown Song', artist_names: 'Unknown Artist', release_date: '1999-04-03', genres: 'bebop jazz',
    origin_latitude: '41.8781', origin_longitude: '-87.6298', origin_city: 'Chicago', origin_country: 'United States',
  }], lookup);
  assert.equal(track.method, 'uploaded metadata');
  assert.equal(track.year, 1999);
  assert.equal(track.genre, 'Jazz');
  assert.equal(track.city, 'Chicago');
  assert.ok(track.x > 250 && track.x < 300);
  assert.ok(track.y > 120 && track.y < 160);
});

await test('keeps an honest fallback for a row with no usable evidence', () => {
  const [track] = analyzePlaylistRows([{ Track: '', Artist: '' }], lookup);
  assert.deepEqual(track, {
    spotifyTrackId: null, track: 'Untitled track', artist: 'Unknown artist', year: null, genre: 'Other', x: null, y: null,
    city: '', country: '', method: 'fallback',
    genreSource: 'unresolved', genreConfidence: 'unresolved', timeSource: 'unresolved', timeConfidence: 'unresolved', geographySource: 'unresolved', geographyConfidence: 'unresolved',
  });
});

await test('uses a global Spotify artist membership before leaving a visitor row unresolved', () => {
  const [track] = analyzePlaylistRows([{ 'Track Name': 'Mavra Froudia', 'Artist Name(s)': 'Efrén López; Stelios Petrakis', 'Artist IDs': 'abcdefghijklmnopqrstUV; ZYXWVUTSRQPONMLKJIHGFE', 'Release Date': '2008-01-01' }], lookup, globalGenreIndex);
  assert.equal(track.genre, 'World');
  assert.equal(track.genreConfidence, 'medium');
  assert.equal(track.year, 2008);
  assert.equal(track.genreSpaceX, 0.31);
  assert.equal(track.genreSpaceY, 0.62);
  assert.deepEqual(track.genreSpaceGenres, ['spanish folk', 'medieval folk']);
  assert.match(track.genreSource, /noteverynoise\.com/);
});

await test('aggregates timeline and map points without losing duplicate tracks', () => {
  const tracks = [
    { ...exactTrack, spotifyTrackId: exactTrack.id, method: 'exact track' },
    { ...exactTrack, spotifyTrackId: exactTrack.id, track: 'Second Track', method: 'exact track' },
    { ...exactTrack, spotifyTrackId: exactTrack.id, track: 'Elsewhere', genre: 'Electronic', year: 2014, x: 400, y: 220, city: 'London', country: 'United Kingdom', method: 'artist inference' },
  ];
  assert.deepEqual(aggregateTimeline(tracks), [
    { genre: 'Hip-hop', year: 2013, count: 2 },
    { genre: 'Electronic', year: 2014, count: 1 },
  ]);
  assert.deepEqual(aggregatePlaces(tracks).map(({ count, label }) => ({ count, label })), [
    { count: 2, label: 'Chicago' },
    { count: 1, label: 'London' },
  ]);
});

await test('maps representative detailed labels into requested top-level families', () => {
  assert.equal(classifyGenre('indietronica electronic'), 'Electronic');
  assert.equal(classifyGenre('Chicago rap hip hop'), 'Hip-hop');
  assert.equal(classifyGenre('contemporary folk singer-songwriter'), 'Modern Folk');
  assert.equal(classifyGenre('unknown uncategorized'), 'Other');
});

await test('retains precise supplied evidence even when an exact track match wins broad enrichment', () => {
  const [track] = analyzePlaylistRows([{
    'Track URI': 'spotify:track:1234567890123456789012',
    'Artist IDs': 'abcdefghijklmnopqrstUV',
    Genres: '["delta blues", "country blues"]',
    'Original Year': '1929', Composer: 'Charley Patton',
  }], lookup, globalGenreIndex);
  assert.deepEqual(track.suppliedGenres, ['delta blues', 'country blues']);
  assert.deepEqual(track.artistIds, ['abcdefghijklmnopqrstUV']);
  assert.equal(track.originalYear, 1929);
  assert.equal(track.composer, 'Charley Patton');
  assert.equal(track.method, 'exact track');
});

await test('accepts JSON artist ID arrays and Spotify artist URIs or URLs', () => {
  const [track] = analyzePlaylistRows([{ Artist: 'Unknown ID-only artist', 'Artist IDs': '["spotify:artist:abcdefghijklmnopqrstUV", "https://open.spotify.com/artist/abcdefghijklmnopqrstUV"]' }], { tracks: [], artists: [] }, globalGenreIndex);
  assert.deepEqual(track.artistIds, ['abcdefghijklmnopqrstUV']);
  assert.equal(track.genreSpacePrimary, 'spanish folk');
});

await test('retains album artist and album URL identity independently of the track artist', () => {
  const [track] = analyzePlaylistRows([{ Track: 'A soundtrack song', Artist: 'Guest performer', Album: 'Soundtrack', 'Album Artist': 'Various Artists', 'Album URI': 'https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRSTUV?si=example' }], { tracks: [], artists: [] });
  assert.equal(track.albumArtist, 'Various Artists');
  assert.equal(track.artist, 'Guest performer');
  assert.equal(track.spotifyAlbumId, 'ABCDEFGHIJKLMNOPQRSTUV');
});
