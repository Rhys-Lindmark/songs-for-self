import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { scoreMusicCoverage } from '../lib/music-coverage.ts';
const catalog = JSON.parse(fs.readFileSync(new URL('../public/music-map.json', import.meta.url)));
const track = (changes = {}) => ({ spotifyTrackId: null, track: 'Unknown title', artist: 'Unknown artist', year: null, genre: 'Other', x: null, y: null, city: '', country: '', method: 'fallback', genreSource: 'unresolved', genreConfidence: 'unresolved', timeSource: 'unresolved', timeConfidence: 'unresolved', geographySource: 'unresolved', geographyConfidence: 'unresolved', ...changes });
const artist = (changes = {}) => ({ id: 'artist-id', key: 'a new artist', name: 'A New Artist', family: 'Pop', primary: 'reggaeton', genres: ['reggaeton'], x: 0.5, y: 0.5, method: 'every-noise-membership + taxonomy label', sourceUrl: 'https://noteverynoise.com/reggaeton.html', ...changes });
const index = (...artists) => ({ schemaVersion: 1, sourceName: 'Fixture', sourceUrl: 'https://example.com', sourceModel: 'Exact genre membership', referenceUrl: 'https://everynoise.com', artists });
const areaFor = (result) => catalog.areas.find((area) => area.id === result.matches[0]?.areaId);

await test('the map has a fixed versioned denominator with real named genres and bounded eras', () => {
  assert.equal(catalog.version, '1.0.0'); assert.equal(catalog.areas.length, 1000); assert.equal(new Set(catalog.areas.map((area) => area.id)).size, 1000);
  assert.deepEqual([catalog.selection.classicalAreas, catalog.selection.earlyRecordedAreas, catalog.selection.modernAreas], [50, 73, 877]);
  for (const area of catalog.areas) { assert.ok(area.sourceUrls.length); assert.ok(area.genreKeys.length); assert.ok(area.endYear >= area.startYear); assert.ok(area.x >= 0 && area.x <= 1); assert.ok(area.y >= 0 && area.y <= 1); }
  assert.ok(catalog.areas.some((area) => area.label === '1920s · Delta blues' && area.family === 'R&B, Soul & Blues'));
  for (const name of ['amapiano', 'reggaeton', 'qawwali', 'gamelan', 'k-pop', 'fado']) assert.ok(catalog.areas.some((area) => area.label === name), `${name} should remain in the worldwide selection`);
  assert.equal(catalog.areas.some((area) => /trap|dubstep/.test(area.label) && area.startYear < 1946), false);
});
await test('empty and duplicate playlists keep the denominator stable and count each area once', () => {
  assert.deepEqual(scoreMusicCoverage([], catalog), { covered: 0, total: 1000, percent: 0, matches: [], unmatched: [] });
  const row = track({ suppliedGenres: ['reggaeton'], year: 2020, timeConfidence: 'user-supplied' });
  const scored = scoreMusicCoverage([row, row, row], catalog);
  assert.equal(scored.covered, 1); assert.equal(scored.percent, 0.1); assert.equal(scored.matches.length, 3);
});
await test('Bach, Handel, Vivaldi, and other Baroque composers cover mutually exclusive areas', () => {
  const result = scoreMusicCoverage(['Johann Sebastian Bach', 'George Frideric Handel', 'Antonio Vivaldi', 'Unlisted composer'].map((name) => track({ artist: name, suppliedGenres: ['baroque'], year: 2020 })), catalog);
  assert.equal(result.covered, 4);
  assert.equal(new Set(result.matches.map((match) => match.areaId)).size, 4);
  assert.ok(result.matches.every((match) => catalog.areas.find((area) => area.id === match.areaId).era === 'Baroque'));
  assert.ok(result.matches[3].areaId.endsWith('other'));
});
await test('composer metadata and explicit title prefixes work, surname substrings do not', () => {
  assert.match(scoreMusicCoverage([track({ composer: 'Bach' })], catalog).matches[0].areaId, /johann-sebastian-bach/);
  assert.match(scoreMusicCoverage([track({ track: 'Bach: Goldberg Variations', artist: 'A Pianist' })], catalog).matches[0].areaId, /johann-sebastian-bach/);
  const burt = scoreMusicCoverage([track({ artist: 'Burt Bacharach', track: 'Bachbeat', suppliedGenres: ['pop'], year: 1967, timeConfidence: 'user-supplied' })], catalog);
  assert.equal(areaFor(burt).family, 'Pop'); assert.ok(!burt.matches[0].areaId.startsWith('composer-'));
});
await test('historical artist rules override reissue dates and expose inference', () => {
  const result = scoreMusicCoverage([track({ artist: 'Robert Johnson', year: 1997, timeConfidence: 'high' })], catalog);
  assert.equal(areaFor(result).label, '1930s · Delta blues'); assert.match(result.matches[0].evidence, /inferred.*overriding/);
  const supplied = scoreMusicCoverage([track({ artist: 'Robert Johnson', originalYear: 1929, suppliedGenres: ['delta blues'] })], catalog);
  assert.equal(areaFor(supplied).label, '1920s · Delta blues');
});
await test('explicit original year overrides reissue metadata for decade scoring', () => {
  const result = scoreMusicCoverage([track({ suppliedGenres: ['rock'], originalYear: 1969, year: 2009, timeConfidence: 'high' })], catalog);
  assert.equal(areaFor(result).label, '1960–1969 · rock'); assert.match(result.matches[0].evidence, /original year 1969/);
});
await test('modern anchor eras are mutually exclusive and never invented without a year', () => {
  const rows = [1968, 1995, 2007].map((year) => track({ suppliedGenres: ['rock'], year, timeConfidence: 'user-supplied' }));
  assert.equal(scoreMusicCoverage(rows, catalog).covered, 3);
  const noDate = scoreMusicCoverage([track({ suppliedGenres: ['rock'] }), track({ suppliedGenres: ['hip hop'] })], catalog);
  assert.equal(noDate.covered, 0); assert.ok(noDate.unmatched.every((row) => row.reason.includes('year')));
});
await test('undated cross-period styles do not silently claim modern cells', () => {
  for (const name of ['delta blues', 'flamenco', 'country', 'gospel', 'qawwali']) {
    const result = scoreMusicCoverage([track({ suppliedGenres: [name] })], catalog);
    assert.equal(result.covered, 0, name); assert.match(result.unmatched[0].reason, /year/);
  }
});
await test('unseen artists can match exact supplied fine genres without manufacturing a family match', () => {
  const result = scoreMusicCoverage([track({ artist: 'Completely unseen', suppliedGenres: ['reggaeton'], year: 2022, timeConfidence: 'user-supplied' })], catalog);
  assert.equal(result.covered, 1); assert.equal(result.matches[0].confidence, 'user-supplied');
  const broad = scoreMusicCoverage([track({ genre: 'Rock', genreConfidence: 'low', genreSource: 'family centroid' })], catalog);
  assert.equal(broad.covered, 0);
});
await test('artist IDs support ID-only evidence; ambiguous names and description-only genres are not credited', () => {
  const idArtist = artist({ id: 'exact-id', name: '', key: '' });
  assert.equal(scoreMusicCoverage([track({ artistIds: ['exact-id'] })], catalog, { artistIndex: index(idArtist) }).covered, 1);
  const duplicate = index(artist(), artist({ id: 'other-id' }));
  assert.equal(scoreMusicCoverage([track({ artist: 'A New Artist' })], catalog, { artistIndex: duplicate }).covered, 0);
  assert.equal(scoreMusicCoverage([track({ artist: 'A New Artist' })], catalog, { artistIndex: index(artist({ method: 'wikidata:description + taxonomy phrase' })) }).covered, 0);
});
await test('Unicode artist names remain distinguishable and support exact matching', () => {
  const result = scoreMusicCoverage([track({ artist: '陳小明' })], catalog, { artistIndex: index(artist({ name: '陳小明', genres: ['mandopop'], primary: 'mandopop' })) });
  assert.equal(result.covered, 1); assert.equal(areaFor(result).label, 'mandopop');
  assert.equal(scoreMusicCoverage([track({ artist: '王小明' })], catalog, { artistIndex: index(artist({ name: '陳小明' })) }).covered, 0);
});
await test('exact detailed track evidence outranks artist-wide memberships', () => {
  const custom = { ...catalog, trackEvidence: { known: { genres: ['rock'], year: 1969, reliableYear: true, source: 'Reviewed track genre', artist: 'A New Artist', title: 'Known', albumId: null } } };
  const result = scoreMusicCoverage([track({ spotifyTrackId: 'known', artist: 'A New Artist' })], custom, { artistIndex: index(artist()) });
  assert.equal(areaFor(result).label, '1960–1969 · rock'); assert.equal(result.matches[0].method, 'exact track evidence');
});
await test('album evidence requires matching artist identity and never blindly labels compilations', () => {
  const custom = { ...catalog, albumEvidence: { album: { artist: 'Verified Artist', genres: ['reggaeton'], source: 'Reviewed shared album tags' } } };
  assert.equal(scoreMusicCoverage([track({ spotifyAlbumId: 'album', artist: 'Verified Artist' })], custom).covered, 1);
  assert.equal(scoreMusicCoverage([track({ spotifyAlbumId: 'album', artist: 'Different Artist' })], custom).covered, 0);
});
await test('family-centroid atlas fallback cannot manufacture a fine genre match', () => {
  const atlas = { points: [{ id: 'new', referenceGenres: ['reggaeton'], method: 'every-noise-family-reference-centroid', source: 'Fallback', confidence: 'low' }] };
  assert.equal(scoreMusicCoverage([track({ spotifyTrackId: 'new' })], catalog, { atlas }).covered, 0);
});
await test('one multi-tag track claims at most one primary area and records its evidence', () => {
  const result = scoreMusicCoverage([track({ suppliedGenres: ['reggaeton', 'salsa', 'cumbia'], year: 2020, timeConfidence: 'user-supplied' })], catalog);
  assert.equal(result.covered, 1); assert.equal(result.matches.length, 1); assert.ok(result.matches[0].evidence);
});

await test('identified composer Spotify IDs work when the upload omits its name', () => {
  const bach = catalog.areas.find((area) => area.id === 'composer-johann-sebastian-bach');
  assert.ok(bach.composerIds.length);
  const result = scoreMusicCoverage([track({ artistIds: [bach.composerIds[0]] })], catalog);
  assert.equal(result.matches[0].areaId, bach.id);
});
await test('explicit classical metadata and a reliable unique musical era can cover other composers', () => {
  const result = scoreMusicCoverage([track({ suppliedGenres: ['classical music'], originalYear: 1700 })], catalog);
  assert.equal(areaFor(result).id, 'classical-baroque-other');
});
await test('missing chronology for exact track genre does not fall through to unrelated artist tags', () => {
  const custom = { ...catalog, trackEvidence: { known: { genres: ['rock'], year: null, reliableYear: false, source: 'Reviewed track genre', artist: 'A New Artist', title: 'Known', albumId: null } } };
  const result = scoreMusicCoverage([track({ spotifyTrackId: 'known', artist: 'A New Artist' })], custom, { artistIndex: index(artist()) });
  assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /year/);
});

await test('ordinary modern recording dates do not relocate unidentified classical compositions', () => {
  const result = scoreMusicCoverage([track({ suppliedGenres: ['classical music'], year: 2020, timeConfidence: 'user-supplied' })], catalog);
  assert.equal(result.covered, 0);
});

await test('reviewed historical artist genre survives explicit original-year precedence', () => {
  const result = scoreMusicCoverage([track({ artist: 'Charley Patton', originalYear: 1929, year: 2009, timeConfidence: 'high' })], catalog);
  assert.equal(areaFor(result).label, '1920s · Delta blues');
});
