import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { normalizeAcclaimedAlbumTitle, scoreAcclaimedAlbums } from '../lib/acclaimed-albums.ts';

const album = (id, title, artist, extras = {}) => ({ id, title, artist, year: 2000, sources: [{ name: 'Fixture critics list', url: 'https://example.com/albums' }], ...extras });
const catalog = { version: 'fixture-1', albums: [
  album('abbey', 'Abbey Road', 'The Beatles', { spotifyAlbumIds: ['known-abbey'] }),
  album('blue-joni', 'Blue', 'Joni Mitchell'), album('blue-other', 'Blue', 'Different Artist'),
  album('bjork', 'Homogenic', 'Björk'), album('self-titled', 'The Beatles', 'The Beatles', { titleAliases: ['The White Album', 'White Album'] }),
  album('collaboration', 'My Life in the Bush of Ghosts', 'Brian Eno & David Byrne'),
  album('alias', 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars', 'David Bowie', { titleAliases: ['Ziggy Stardust'], artistAliases: ['Bowie'] }),
  album('live', 'Live at Leeds', 'The Who'), album('unicode', '樂與怒', 'Beyond'),
  album('apostrophe', "What's Going On", 'Marvin Gaye'),
] };
const track = (changes = {}) => ({ spotifyTrackId: null, track: 'An arbitrary song title', artist: 'Unknown artist', year: null, genre: 'Other', x: null, y: null, city: '', country: '', method: 'fallback', genreSource: 'unresolved', genreConfidence: 'unresolved', timeSource: 'unresolved', timeConfidence: 'unresolved', geographySource: 'unresolved', geographyConfidence: 'unresolved', ...changes });
const atlas = (...points) => ({ points: (points.length ? points : [{}]).map((point) => ({ id: 'reference-track', title: 'A song', artists: 'The Beatles', album: 'Abbey Road', spotifyAlbumId: 'atlas-abbey', ...point })) });

await test('the denominator comes from the fixed catalog and repeated songs earn an album once', () => {
  const row = track({ album: 'Abbey Road', artist: 'The Beatles' });
  const result = scoreAcclaimedAlbums([row, row, row], catalog);
  assert.equal(result.total, 10); assert.equal(result.covered, 1); assert.equal(result.percent, 10); assert.equal(result.matches.length, 3);
  assert.deepEqual(scoreAcclaimedAlbums([], { version: 'empty', albums: [] }), { covered: 0, total: 0, percent: 0, matches: [], unmatched: [] });
});
await test('a known Spotify album ID matches without optional textual metadata', () => {
  const result = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'known-abbey' })], catalog);
  assert.equal(result.matches[0].albumId, 'abbey'); assert.equal(result.matches[0].method, 'catalog Spotify album ID');
});
await test('a known ID does not silently erase conflicting explicit album or artist metadata', () => {
  for (const changes of [{ album: 'Greatest Hits', artist: 'The Beatles' }, { album: 'Abbey Road', artist: 'A Tribute Band' }]) {
    const result = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'known-abbey', ...changes })], catalog);
    assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /conflicts/);
  }
});
await test('recognized deluxe, expanded, remaster, and anniversary suffixes preserve album identity', () => {
  for (const title of ['Abbey Road (Remastered)', 'Abbey Road [2011 Remaster]', 'Abbey Road - 2011 Remaster', 'Abbey Road (Deluxe Edition)', 'Abbey Road (Expanded Edition)', 'Abbey Road (50th Anniversary Super Deluxe Edition)', 'Abbey Road Super Deluxe Edition', 'Abbey Road (Deluxe Edition) [2011 Remaster]']) {
    const result = scoreAcclaimedAlbums([track({ album: title, artist: 'The Beatles' })], catalog);
    assert.equal(result.covered, 1, title);
  }
});
await test('meaningful live, covers, tribute, acoustic, demo, remix, and re-recording labels are not stripped', () => {
  for (const title of ['Abbey Road (Live)', 'Abbey Road (Live Deluxe Edition)', 'Abbey Road - Re-recorded', 'Abbey Road (Re-recording)', 'Abbey Road (Tribute)', 'Abbey Road (Covers)', 'Abbey Road (Acoustic)', 'Abbey Road (Demo)', 'Abbey Road (Remix)', "Abbey Road (Taylor's Version)"]) {
    assert.equal(scoreAcclaimedAlbums([track({ album: title, artist: 'The Beatles' })], catalog).covered, 0, title);
  }
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Live at Leeds (Deluxe Edition)', artist: 'The Who' })], catalog).covered, 1);
});
await test('same-titled albums require complete artist identity, not a title-only guess', () => {
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Blue', artist: 'Joni Mitchell' })], catalog).matches[0].albumId, 'blue-joni');
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Blue', artist: 'Different Artist' })], catalog).matches[0].albumId, 'blue-other');
  const missing = scoreAcclaimedAlbums([track({ album: 'Blue' })], catalog);
  assert.equal(missing.covered, 0); assert.match(missing.unmatched[0].reason, /Artist identity is missing/);
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Blue', artist: 'Joni Mitchell Tribute' })], catalog).covered, 0);
});
await test('punctuation, accents, and non-Latin titles survive normalization conservatively', () => {
  assert.equal(scoreAcclaimedAlbums([track({ album: 'HOMOGENIC', artist: 'Bjork' })], catalog).covered, 1);
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Whats Going On', artist: 'Marvin Gaye' })], catalog).covered, 1);
  assert.equal(scoreAcclaimedAlbums([track({ album: '樂與怒', artist: 'Beyond' })], catalog).covered, 1);
  assert.equal(scoreAcclaimedAlbums([track({ album: '海闊天空', artist: 'Beyond' })], catalog).covered, 0);
});
await test('self-titled albums and explicit aliases are supported without artist-name fuzziness', () => {
  assert.equal(scoreAcclaimedAlbums([track({ album: 'The Beatles', artist: 'The Beatles' })], catalog).matches[0].albumId, 'self-titled');
  assert.equal(scoreAcclaimedAlbums([track({ album: 'White Album', artist: 'The Beatles' })], catalog).matches[0].albumId, 'self-titled');
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Ziggy Stardust', artist: 'Bowie' })], catalog).matches[0].albumId, 'alias');
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Abbey Road', artist: 'Beatles' })], catalog).covered, 0);
});
await test('primary artist guests and complete joint identities work, but guests alone do not own albums', () => {
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Abbey Road', artist: 'The Beatles; Guest Performer' })], catalog).covered, 1);
  assert.equal(scoreAcclaimedAlbums([track({ album: 'My Life in the Bush of Ghosts', artist: 'Brian Eno; David Byrne' })], catalog).covered, 1);
  assert.equal(scoreAcclaimedAlbums([track({ album: 'My Life in the Bush of Ghosts', artist: 'Brian Eno' })], catalog).covered, 0);
  assert.equal(scoreAcclaimedAlbums([track({ album: 'Abbey Road', artist: 'Guest Performer; The Beatles' })], catalog).covered, 0);
});
await test('artist-only and fuzzy song-title evidence never earn an album', () => {
  for (const changes of [{ artist: 'The Beatles' }, { artist: 'The Beatles', track: 'Come Together' }, { artist: 'The Beatles', album: 'Abbey Roads' }]) assert.equal(scoreAcclaimedAlbums([track(changes)], catalog).covered, 0);
});
await test('a track on an unlisted compilation does not earn its original studio album', () => {
  const result = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', album: 'The Beatles Greatest Hits', spotifyAlbumId: 'compilation-id', artist: 'The Beatles' })], catalog, { atlas: atlas() });
  assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /conflicts/);
});
await test('exact reference track metadata may fill missing album fields', () => {
  const result = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', artist: 'The Beatles' })], catalog, { atlas: atlas() });
  assert.equal(result.matches[0].albumId, 'abbey'); assert.equal(result.matches[0].method, 'exact track reference album metadata');
  const missingArtist = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', album: 'Abbey Road' })], catalog, { atlas: atlas() });
  assert.equal(missingArtist.covered, 1);
});
await test('exact reference tracks never override supplied artist or album identity', () => {
  for (const changes of [{ album: 'A Different Album', artist: 'The Beatles' }, { artist: 'A Different Artist' }, { spotifyAlbumId: 'some-other-release' }]) {
    const result = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', ...changes })], catalog, { atlas: atlas() });
    assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /conflicts/);
  }
});
await test('atlas album IDs are learned only through canonical title AND artist verification', () => {
  const known = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'atlas-abbey' })], catalog, { atlas: atlas() });
  assert.equal(known.matches[0].albumId, 'abbey'); assert.match(known.matches[0].method, /verified against reference atlas/);
  const wrongArtist = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'atlas-abbey' })], catalog, { atlas: atlas({ artists: 'A Cover Band' }) });
  assert.equal(wrongArtist.covered, 0);
  const wrongAlbum = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'atlas-abbey' })], catalog, { atlas: atlas({ album: 'Greatest Hits' }) });
  assert.equal(wrongAlbum.covered, 0);
});
await test('an unrecognized supplied album ID does not block otherwise exact own metadata', () => {
  const result = scoreAcclaimedAlbums([track({ album: 'Abbey Road', artist: 'The Beatles', spotifyAlbumId: 'another-remaster-id' })], catalog);
  assert.equal(result.covered, 1); assert.equal(result.matches[0].method, 'album title and artist');
});
await test('conflicting atlas album identities stay ambiguous rather than picking the last record', () => {
  const result = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'atlas-abbey' })], catalog, { atlas: atlas({}, { id: 'other-track', album: 'Blue', artists: 'Joni Mitchell' }) });
  assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /conflicting/);
});
await test('album IDs may be supplied as Spotify URLs or URIs without case-folding their IDs', () => {
  const id = '1234567890AbCdEfGhIjKl';
  const custom = { version: 'ids', albums: [album('known', 'An Album', 'An Artist', { spotifyAlbumIds: [id] })] };
  for (const supplied of [id, `spotify:album:${id}`, `https://open.spotify.com/album/${id}?si=test`, `https://open.spotify.com/intl-en/album/${id}`]) assert.equal(scoreAcclaimedAlbums([track({ spotifyAlbumId: supplied })], custom).covered, 1);
  assert.equal(scoreAcclaimedAlbums([track({ spotifyAlbumId: id.toLowerCase() })], custom).covered, 0);
});
await test('title normalization never collapses unrelated meaningful variants', () => {
  assert.notEqual(normalizeAcclaimedAlbumTitle('Blue'), normalizeAcclaimedAlbumTitle('Blue (Live)'));
  assert.notEqual(normalizeAcclaimedAlbumTitle('Red'), normalizeAcclaimedAlbumTitle("Red (Taylor's Version)"));
  assert.equal(normalizeAcclaimedAlbumTitle('Homogenic (2015 Remaster)'), normalizeAcclaimedAlbumTitle('Homogenic'));
});

await test('commas inside band names do not turn them into a different primary artist', () => {
  const custom = { version: 'band', albums: [album('earth', 'An Album', 'Earth')] };
  assert.equal(scoreAcclaimedAlbums([track({ album: 'An Album', artist: 'Earth, Wind & Fire' })], custom).covered, 0);
  assert.equal(scoreAcclaimedAlbums([track({ album: 'My Life in the Bush of Ghosts', artist: 'Brian Eno, David Byrne' })], catalog).covered, 1);
});
await test('edition suffixes after meaningful title separators preserve the original title', () => {
  const custom = { version: 'live', albums: [album('live', 'A Concert - Live', 'A Band')] };
  const result = scoreAcclaimedAlbums([track({ album: 'A Concert - Live - 2011 Remaster', artist: 'A Band' })], custom);
  assert.equal(result.covered, 1);
  assert.notEqual(normalizeAcclaimedAlbumTitle('A Concert - Live - 2011 Remaster'), normalizeAcclaimedAlbumTitle('A Concert'));
});

await test('explicit album artist takes precedence over track guests and enables credited soundtracks', () => {
  const custom = { version: 'album-artist', albums: [album('soundtrack', 'A Soundtrack', 'Various Artists'), album('joint', 'A Collaboration', 'Brian Eno & David Byrne')] };
  const soundtrack = scoreAcclaimedAlbums([track({ album: 'A Soundtrack', artist: 'A Featured Singer', albumArtist: 'Various Artists' })], custom);
  assert.equal(soundtrack.matches[0].albumId, 'soundtrack');
  const joint = scoreAcclaimedAlbums([track({ album: 'A Collaboration', artist: 'David Byrne', albumArtist: 'Brian Eno; David Byrne' })], custom);
  assert.equal(joint.matches[0].albumId, 'joint');
  assert.equal(scoreAcclaimedAlbums([track({ album: 'A Soundtrack', artist: 'A Featured Singer' })], custom).covered, 0);
});

await test('the published catalog has exactly 500 unique sourced album identities and a fixed version', () => {
  const published = JSON.parse(fs.readFileSync(new URL('../public/acclaimed-albums.json', import.meta.url)));
  assert.equal(published.version, '1.0.0'); assert.equal(published.total, 500); assert.equal(published.albums.length, 500);
  assert.equal(new Set(published.albums.map((album) => album.id)).size, 500);
  const identities = published.albums.map((album) => `${normalizeAcclaimedAlbumTitle(album.title)}|${album.artist.toLowerCase()}`);
  assert.equal(new Set(identities).size, 500);
  for (const album of published.albums) {
    assert.ok(album.title && album.artist); assert.ok(album.sources.length);
    for (const source of album.sources) assert.match(source.url, /^https:\/\//);
  }
  assert.deepEqual(published.selection.stages.map((stage) => stage.added), [65, 301, 40, 94, 0]);
});
await test('the blend contains real Metacritic, Fantano, and book memberships without pretending to be one official list', () => {
  const published = JSON.parse(fs.readFileSync(new URL('../public/acclaimed-albums.json', import.meta.url)));
  assert.deepEqual(published.selection.sourceCounts, { 'rolling-stone-2023': 396, 'book-2005': 341, 'metacritic-2023-table': 15, 'metacritic-2024': 15, 'fantano-2024': 15, 'fantano-2025': 15, 'needle-drop-10s': 8, 'metacritic-fetch': 1 });
  assert.match(published.description, /fixed 500-album blend/); assert.match(published.description, /Each entry retains its source/);
  const metadata = JSON.parse(fs.readFileSync(new URL('../data/acclaimed-albums-sources.json', import.meta.url)));
  for (const source of metadata.sources.filter((source) => source.kind === 'critic')) {
    const entries = metadata.criticSelections.filter((entry) => entry.memberships.some((membership) => membership.sourceId === source.id));
    const words = entries.reduce((sum, entry) => sum + (`${entry.title} ${entry.artist} ${entry.year || ''} ${entry.memberships.find((membership) => membership.sourceId === source.id)?.position || ''}`.match(/[\p{L}\p{N}_’']+/gu) || []).length, 0);
    assert.equal(words, source.metadataWordCount); assert.ok(words <= 150, source.id);
  }
  assert.ok(metadata.sources.filter((source) => source.kind === 'canon').every((source) => source.license.includes('CC0')));
});
await test('canonical validation albums have stable IDs and primary or explicitly transcribed acclaim evidence', () => {
  const published = JSON.parse(fs.readFileSync(new URL('../public/acclaimed-albums.json', import.meta.url)));
  for (const [title, artist] of [['Abbey Road','The Beatles'],['Blue','Joni Mitchell'],['Kind of Blue','Miles Davis'],['To Pimp a Butterfly','Kendrick Lamar'],['Illmatic','Nas'],['Fetch the Bolt Cutters','Fiona Apple']]) {
    const album = published.albums.find((album) => album.title.toLowerCase() === title.toLowerCase() && album.artist.toLowerCase() === artist.toLowerCase());
    assert.ok(album, title); assert.ok(album.sources.length);
    const score = scoreAcclaimedAlbums([track({ album: title, artist })], published);
    assert.equal(score.matches[0].albumId, album.id); assert.equal(score.covered, 1); assert.equal(score.total, 500); assert.equal(score.percent, 0.2);
  }
  const swans = published.albums.find((album) => album.title === 'To Be Kind' && album.artist === 'Swans');
  assert.ok(swans.sources.some((source) => source.url === 'https://theneedledrop.com/1010/'));
});

await test('a learned trusted album ID conflicts before another valid album title can earn credit', () => {
  const result = scoreAcclaimedAlbums([track({ spotifyAlbumId: 'atlas-abbey', album: 'Blue', artist: 'Joni Mitchell' })], catalog, { atlas: atlas() });
  assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /conflicts/);
});
await test('an exact-track release conflict cannot manufacture a different valid album from text alone', () => {
  const result = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', album: 'Blue', artist: 'Joni Mitchell' })], catalog, { atlas: atlas() });
  assert.equal(result.covered, 0); assert.match(result.unmatched[0].reason, /conflicts/);
});
await test('a verified listed compilation release can contain a song also known from a studio album', () => {
  const custom = { ...catalog, albums: [...catalog.albums, album('compilation', 'A Listed Compilation', 'The Beatles', { spotifyAlbumIds: ['verified-compilation'] })] };
  const result = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', spotifyAlbumId: 'verified-compilation', album: 'A Listed Compilation', artist: 'The Beatles' })], custom, { atlas: atlas() });
  assert.equal(result.covered, 1); assert.equal(result.matches[0].albumId, 'compilation');
});
await test('explicit soundtrack album artists outrank a reference point track guest', () => {
  const custom = { version: 'soundtrack', albums: [album('soundtrack', 'A Soundtrack', 'Various Artists')] };
  const result = scoreAcclaimedAlbums([track({ spotifyTrackId: 'reference-track', album: 'A Soundtrack', albumArtist: 'Various Artists', artist: 'A Featured Singer' })], custom, { atlas: atlas({ album: 'A Soundtrack', artists: 'A Featured Singer' }) });
  assert.equal(result.covered, 1);
});

await test('the fixed catalog recognizes verified ordinary-text aliases for symbolic album titles', () => {
  const albums = JSON.parse(fs.readFileSync(new URL('../public/acclaimed-albums.json', import.meta.url), 'utf8'));
  const result = scoreAcclaimedAlbums([track({ artist: 'Prince', album: 'Sign O’ the Times (2017 Remaster)' })], albums);
  assert.equal(result.covered, 1);
  assert.equal(result.matches[0].albumId, 'mbid-90718403-7634-3786-84bf-2053a7bd4f4c');
});
