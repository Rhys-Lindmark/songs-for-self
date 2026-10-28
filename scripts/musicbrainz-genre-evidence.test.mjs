import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(new URL('data/musicbrainz-artist-genre-cache.json', root), 'utf8'));
const classified = rows.filter((row) => row.genre_source.startsWith('musicbrainz:artist-genres/'));

await test('MusicBrainz artist genre cache is source-addressable and collision-free', () => {
  const entries = Object.values(cache.artists);
  assert.ok(entries.length >= 250);
  assert.equal(new Set(entries.map((entry) => entry.musicbrainzArtistId)).size, entries.length);
  for (const entry of entries) {
    assert.match(entry.musicbrainzArtistId, /^[0-9a-f-]{36}$/);
    assert.equal(entry.sourceUrl, `https://musicbrainz.org/artist/${entry.musicbrainzArtistId}`);
    assert.ok(entry.fetchedAt);
  }
});

await test('MusicBrainz genre placements retain exact artist IDs and evidence URLs', () => {
  assert.ok(classified.length > 0);
  for (const row of classified) {
    const artist = row.artist_names.split(';')[0].trim();
    const evidence = cache.artists[artist];
    assert.ok(evidence, `Missing cached evidence for ${artist}`);
    assert.equal(row.genre_source, `musicbrainz:artist-genres/${evidence.musicbrainzArtistId}`);
    assert.ok(row.genre_evidence.includes(evidence.sourceUrl));
    assert.match(row.genre_evidence, /exact-name MusicBrainz match score:/);
    assert.match(row.genre_evidence, /MusicBrainz (genre|tag): .+ \(\d+ votes\)/);
    assert.notEqual(row.genre_family, 'Other');
  }
});

await test('high-signal MusicBrainz fixtures use the requested families', () => {
  const expected = new Map([
    ['Louis Armstrong & His Hot Five', 'Jazz'],
    ['Mariachi El Bronx', 'World'],
    ['Neat Beats', 'Hip-hop'],
    ['Nourished by Time', 'R&B, Soul & Blues'],
    ['Skeewiff', 'Electronic'],
    ['The Carter Family', 'Country'],
  ]);
  for (const [artist, family] of expected) {
    const artistRows = classified.filter((row) => row.artist_names.split(';')[0].trim() === artist);
    assert.ok(artistRows.length > 0, `Expected classified rows for ${artist}`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
  }
});

await test('MusicBrainz World placements require positive genre evidence', () => {
  const positive = /world(?: music)?|reggae|ska|latin|afrobeat|afrobeats|highlife|qawwali|raï|flamenco|bossa nova|samba|calypso|gamelan|cumbia|salsa|fado|klezmer|mariachi|axé|tango|chaabi|maloya|guadeloupe|soukous|rebetiko|laïko|arabic|turkish|chalga|bollywood|timba|greece|cuban rumba|boogaloo|galicia/i;
  for (const row of classified.filter((item) => item.genre_family === 'World')) assert.match(row.genre_evidence, positive);
});
