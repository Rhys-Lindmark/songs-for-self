import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(new URL('data/wikidata-artist-genre-cache.json', root), 'utf8'));
const classified = rows.filter((row) => row.genre_source.startsWith('wikidata:name/P136/'));

await test('Wikidata name-genre cache retains unique entities and match method', () => {
  const entries = Object.values(cache.artists);
  assert.ok(entries.length >= 600);
  assert.equal(new Set(entries.map((entry) => entry.wikidataId)).size, entries.length);
  for (const entry of entries) {
    assert.match(entry.wikidataId, /^Q\d+$/);
    assert.equal(entry.sourceUrl, `https://www.wikidata.org/wiki/${entry.wikidataId}`);
    assert.equal(entry.matchMethod, 'exact-name-single-musical-candidate');
    assert.ok(entry.fetchedAt);
  }
});

await test('Wikidata P136 placements retain entity-addressable provenance', () => {
  assert.ok(classified.length >= 300);
  for (const row of classified) {
    const artist = row.artist_names.split(';')[0].trim();
    const evidence = cache.artists[artist];
    assert.ok(evidence, `Missing Wikidata evidence for ${artist}`);
    assert.equal(row.genre_source, `wikidata:name/P136/${evidence.wikidataId}`);
    assert.ok(row.genre_evidence.includes(evidence.sourceUrl));
    assert.match(row.genre_evidence, /exact-name single musical candidate/);
    assert.notEqual(row.genre_family, 'Other');
  }
});

await test('high-signal Wikidata fixtures use requested families', () => {
  const expected = new Map([
    ['The Wooden Sky', 'Modern Folk'],
    ['Rizzle Kicks', 'Hip-hop'],
    ['Jesse Cook', 'World'],
    ['Sara Gazarek', 'Jazz'],
    ['Carbon Leaf', 'Country'],
  ]);
  for (const [artist, family] of expected) {
    const artistRows = rows.filter((row) => row.artist_names.split(';')[0].trim() === artist);
    assert.ok(artistRows.length > 0, `Expected rows for ${artist}`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
  }
});

await test('Wikidata World placements require positive genre evidence', () => {
  const positive = /world(?: music)?|reggae|ska|latin|afrobeat|afrobeats|highlife|qawwali|raï|flamenco|bossa nova|samba|calypso|gamelan|cumbia|salsa|fado|klezmer|mariachi|axé|tango|chaabi|maloya|guadeloupe|soukous|rebetiko|laïko|arabic|turkish|chalga|bollywood|timba|greece|cuban rumba|boogaloo|galicia/i;
  for (const row of classified.filter((item) => item.genre_family === 'World')) assert.match(row.genre_evidence, positive);
});
