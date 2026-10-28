import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const payload = JSON.parse(fs.readFileSync(new URL('../public/genre-space-data.json', import.meta.url), 'utf8'));

await test('genre-space artifact places every bundled track exactly once', () => {
  assert.equal(payload.summary.tracks, 7582);
  assert.equal(payload.points.length, 7582);
  assert.equal(new Set(payload.points.map((point) => point.id)).size, 7582);
  assert.equal(payload.families.reduce((sum, family) => sum + family.count, 0), 7582);
  assert.equal(payload.families.find((family) => family.family === 'Other'), undefined);
});

await test('genre-space coordinates and evidence are complete', () => {
  assert.ok(payload.points.every((point) => Number.isFinite(point.x) && point.x >= 0 && point.x <= 1));
  assert.ok(payload.points.every((point) => Number.isFinite(point.y) && point.y >= 0 && point.y <= 1));
  assert.ok(payload.points.every((point) => point.family && point.primary && point.confidence && point.source && point.method));
  assert.ok(payload.points.every((point) => Array.isArray(point.spotifyArtistIds)));
  assert.ok(payload.points.every((point) => Number.isFinite(point.referenceX) && Number.isFinite(point.referenceY)));
  assert.ok(payload.points.every((point) => Array.isArray(point.referenceGenres) && point.referenceGenres.length > 0));
  assert.equal(payload.projection.modelVersion, 'genre-space-v2-every-noise-2023-12-04');
  assert.match(payload.projection.method, /pinned 2023-12-04 Every Noise genre map/i);
  assert.deepEqual(payload.projection.reproducibleFrom, ['genre_primary', 'genre_secondary', 'genre_family', 'spotify_track_id', 'every-noise-reference-2023.json']);
  assert.equal(payload.summary.referenceGenres, 6291);
  assert.equal(payload.summary.exactReferenceTracks + payload.summary.familyReferenceFallbackTracks, 7582);
  assert.equal(payload.summary.directLabelTracks + payload.summary.artistMembershipTracks + payload.summary.catalogArtistTracks, payload.summary.exactReferenceTracks);
  assert.ok(payload.summary.catalogArtistTracks >= 10);
  assert.equal(payload.points.filter((point) => point.referenceMatchCount > 0).length, payload.summary.exactReferenceTracks);
  assert.equal(payload.points.filter((point) => point.referenceMatchCount === 0).length, payload.summary.familyReferenceFallbackTracks);
  assert.ok(payload.points.every((point) => Array.isArray(point.referenceSource) && point.referenceSource.length > 0));
});

await test('genre clusters exactly reconcile their points and centroids', () => {
  assert.equal(new Set(payload.clusters.map((cluster) => cluster.id)).size, payload.clusters.length);
  for (const cluster of payload.clusters) {
    const members = payload.points.filter((point) => point.family === cluster.family && point.primary === cluster.label);
    assert.equal(cluster.count, members.length);
    const meanX = members.reduce((sum, point) => sum + point.x, 0) / members.length;
    const meanY = members.reduce((sum, point) => sum + point.y, 0) / members.length;
    assert.ok(Math.abs(cluster.x - meanX) < 0.000002);
    assert.ok(Math.abs(cluster.y - meanY) < 0.000002);
  }
});

await test('genre-space album covers retain source-addressable provenance', () => {
  assert.ok(payload.summary.albumCovers > 3000);
  assert.equal(payload.summary.albumCovers, Object.keys(payload.albums).length);
  for (const [albumId, cover] of Object.entries(payload.albums)) {
    assert.ok(payload.points.some((point) => point.spotifyAlbumId === albumId));
    assert.equal(cover.coverUrl, `https://coverartarchive.org/release-group/${cover.coverSourceId}/front-250`);
    assert.equal(cover.coverSource, 'Cover Art Archive');
  }
});

await test('artist neighborhoods reconcile their primary-artist tracks', () => {
  assert.equal(payload.summary.artists, payload.artists.length);
  assert.equal(new Set(payload.artists.map((artist) => artist.id)).size, payload.artists.length);
  assert.equal(payload.artists.reduce((sum, artist) => sum + artist.count, 0), 7582);
  for (const artist of payload.artists) {
    assert.ok(artist.label && artist.family && Number.isFinite(artist.x) && Number.isFinite(artist.y));
  }
});
