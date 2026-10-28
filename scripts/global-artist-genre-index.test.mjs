import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const index = JSON.parse(fs.readFileSync(new URL('../public/artist-genre-index.json', import.meta.url), 'utf8'));

await test('global visitor artist index is large, source-addressable, and fully placeable', () => {
  assert.equal(index.schemaVersion, 1);
  assert.match(index.sourceUrl, /^https:\/\/noteverynoise\.com\/$/);
  assert.match(index.referenceUrl, /^https:\/\//);
  assert.ok(index.artists.length >= 70_000, `Only ${index.artists.length} artists were indexed`);
  assert.equal(new Set(index.artists.map((artist) => artist.id)).size, index.artists.length);
  assert.ok(index.artists.every((artist) => artist.id.length === 22));
  assert.ok(index.artists.every((artist) => artist.family && artist.family !== 'Other'));
  assert.ok(index.artists.every((artist) => artist.x >= 0 && artist.x <= 1 && artist.y >= 0 && artist.y <= 1));
  assert.ok(index.artists.every((artist) => artist.genres.length > 0 && /^https:\/\/(?:noteverynoise\.com\/|www\.wikidata\.org\/wiki\/Q\d+)/.test(artist.sourceUrl)));
  assert.ok(index.artists.filter((artist) => artist.method.startsWith('wikidata:')).length >= 25_000);
});

await test('multilingual Wikidata descriptions only place explicit musical phrases', () => {
  const efren = index.artists.find((artist) => artist.id === '0AWkfIA8FQVNGhUS591AHQ');
  assert.equal(efren?.family, 'Classical');
  assert.equal(efren?.method, 'wikidata:description + taxonomy phrase');
  assert.match(efren?.genres[0] ?? '', /música antiga/i);

  const byName = new Map(index.artists.map((artist) => [artist.key, artist]));
  assert.equal(byName.get('dona dumitru siminica'), undefined, 'Romanian must not substring-match the Romani genre');
});

await test('global visitor index retains recognizable regional and mainstream artist evidence', () => {
  const byName = new Map(index.artists.map((artist) => [artist.key, artist]));
  for (const name of ['burna boy', 'bad bunny', 'kendrick lamar', 'the beatles']) {
    const artist = byName.get(name);
    assert.ok(artist, `Missing ${name}`);
    assert.notEqual(artist.family, 'Other');
  }
});
