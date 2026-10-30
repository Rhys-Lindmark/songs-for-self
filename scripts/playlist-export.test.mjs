import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'csv-parse/sync';
import { analyzePlaylistRows } from '../lib/playlist-analyzer.ts';
import { enrichedPlaylistFileName, serializeEnrichedPlaylist } from '../lib/playlist-export.ts';

const track = {
  album: 'My album', spotifyAlbumId: 'ABCDEFGHIJKLMNOPQRSTUV', coverUrl: 'https://i.scdn.co/image/test-cover',
  spotifyTrackId: '1234567890123456789012', track: 'Song, "One"', artist: 'Artist A', year: 1999, genre: 'Electronic', x: 200, y: 150, city: 'London', country: 'United Kingdom', method: 'exact track',
  genreSource: 'catalog:genre', genreConfidence: 'high', timeSource: 'catalog:date', timeConfidence: 'medium', geographySource: 'catalog:place', geographyConfidence: 'medium',
};
const placement = { index: 0, family: 'Electronic', primary: 'Trip-hop', x: 0.42, y: 0.61, method: 'visitor exact match', confidence: 'high', source: 'Every Noise reference', referenceGenres: ['trip hop', 'downtempo'] };

await test('serializes auditable visitor enrichment as round-trippable CSV', () => {
  const [row] = parse(serializeEnrichedPlaylist([track], [placement]), { columns: true, skip_empty_lines: true });
  assert.equal(row.track, 'Song, "One"');
  assert.equal(row.album, track.album);
  assert.equal(row.spotify_album_id, track.spotifyAlbumId);
  assert.equal(row.cover_url, track.coverUrl);
  assert.equal(row.timeline_source, 'catalog:date');
  assert.equal(row.genre_source, 'catalog:genre');
  assert.equal(row.geography_source, 'catalog:place');
  assert.equal(row.genre_space_method, 'visitor exact match');
  assert.equal(row.every_noise_reference_genres, 'trip hop; downtempo');
});

await test('unresolved genre-space rows remain explicit in the export', () => {
  const [row] = parse(serializeEnrichedPlaylist([{ ...track, spotifyTrackId: null, genre: 'Other', genreSource: 'unresolved', genreConfidence: 'unresolved' }], []), { columns: true, skip_empty_lines: true });
  assert.equal(row.genre_space_detail, 'Unresolved');
  assert.equal(row.genre_space_confidence, 'unresolved');
});

await test('download filenames are stable and filesystem-safe', () => {
  assert.equal(enrichedPlaylistFileName('My Playlist (August).CSV'), 'My-Playlist-August-songs-for-self-enriched.csv');
  assert.equal(enrichedPlaylistFileName('...'), 'playlist-songs-for-self-enriched.csv');
});

await test('coverage evidence survives an enriched CSV download and reimport', () => {
  const source = { ...track, spotifyTrackId: null, artistIds: ['abcdefghijklmnopqrstUV'], suppliedGenres: ['delta blues'], originalYear: 1929, composer: 'Charley Patton' };
  const rows = parse(serializeEnrichedPlaylist([source], []), { columns: true, skip_empty_lines: true });
  const [restored] = analyzePlaylistRows(rows, { tracks: [], artists: [] });
  assert.deepEqual(restored.artistIds, source.artistIds);
  assert.deepEqual(restored.suppliedGenres, source.suppliedGenres);
  assert.equal(restored.originalYear, source.originalYear);
  assert.equal(restored.composer, source.composer);
  assert.equal(restored.year, source.year);
});
