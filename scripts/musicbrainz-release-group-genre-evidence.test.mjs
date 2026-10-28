import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(new URL('data/musicbrainz-release-group-genre-cache.json', root), 'utf8'));
const albumCache = JSON.parse(fs.readFileSync(new URL('data/musicbrainz-cache.json', root), 'utf8'));
const classified = rows.filter((row) => row.genre_source.startsWith('musicbrainz:release-group-genres/'));

await test('MusicBrainz release-group genre cache retains exact source IDs and matched albums', () => {
  const entries = Object.values(cache.releaseGroups);
  assert.ok(entries.length > 0);
  assert.equal(new Set(entries.map((entry) => entry.musicbrainzReleaseGroupId)).size, entries.length);
  const matchedIds = new Set(Object.values(albumCache.albums).filter((album) => album.matched).map((album) => album.musicbrainzReleaseGroupId));
  for (const entry of entries) {
    assert.match(entry.musicbrainzReleaseGroupId, /^[0-9a-f-]{36}$/);
    assert.ok(matchedIds.has(entry.musicbrainzReleaseGroupId));
    assert.equal(entry.sourceUrl, `https://musicbrainz.org/release-group/${entry.musicbrainzReleaseGroupId}`);
    assert.ok(entry.fetchedAt);
  }
});

await test('release-group genre placements retain album-specific evidence and vote counts', () => {
  assert.ok(classified.length > 0);
  for (const row of classified) {
    const id = row.genre_source.split('/').at(-1);
    const evidence = cache.releaseGroups[id];
    assert.ok(evidence, `Missing release-group evidence for ${row.artist_names} — ${row.album_name}`);
    assert.ok(row.genre_evidence.includes(evidence.sourceUrl));
    assert.match(row.genre_evidence, /exact release-group match/);
    assert.match(row.genre_evidence, /release-group (genre|tag): .+ \(\d+ votes\)/);
    assert.notEqual(row.genre_family, 'Other');
  }
});

await test('release-group World placements retain positive regional or genre evidence', () => {
  const positive = /world(?: music)?|weltmusik|african|reggae|ska|latin|afrobeat|afrobeats|highlife|chimurenga|qawwali|raï|flamenco|bossa nova|samba|rumba|calypso|gamelan|cumbia|salsa|fado|klezmer|mariachi|axé|tango|chaabi|maloya|guadeloupe|soukous|rebetiko|laïko|arabic|turkish|chalga|bollywood|timba|greece|boogaloo|galicia|romani|zouk|indian classical|persian classical|hindustani classical|carnatic|hawaiian/i;
  for (const row of classified.filter((item) => item.genre_family === 'World')) assert.match(row.genre_evidence, positive);
});
