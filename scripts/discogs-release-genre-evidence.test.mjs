import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(new URL('data/discogs-release-genre-cache.json', root), 'utf8'));
const decisions = JSON.parse(fs.readFileSync(new URL('data/discogs-release-genre-decisions.json', root), 'utf8'));
const classified = rows.filter((row) => row.genre_source.startsWith('discogs:release-genres/'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:discogs-release-review/'));

await test('Discogs cache retains conservative release matches and source URLs', () => {
  const matched = Object.values(cache.albums).filter((entry) => entry.matched);
  assert.ok(matched.length > 0);
  for (const entry of matched) {
    assert.ok(Number.isInteger(entry.discogsReleaseId));
    assert.ok(entry.titleSimilarity >= 0.86);
    assert.ok(entry.artistSimilarity >= 0.72);
    assert.match(entry.sourceUrl, /^https:\/\/www\.discogs\.com\/release\//);
    assert.ok(entry.genres.length > 0 || entry.styles.length > 0);
    assert.ok(entry.fetchedAt);
  }
});

await test('Discogs placements retain album-specific genres, match scores, and attribution', () => {
  assert.ok(classified.length > 0);
  for (const row of classified) {
    const evidence = cache.albums[row.spotify_album_id];
    assert.ok(evidence?.matched, `Missing Discogs evidence for ${row.artist_names} — ${row.album_name}`);
    assert.equal(row.genre_source, `discogs:release-genres/${evidence.discogsReleaseId}`);
    assert.ok(row.genre_evidence.includes(evidence.sourceUrl));
    assert.match(row.genre_evidence, /title similarity:/);
    assert.match(row.genre_evidence, /Discogs (genre|style):/);
    assert.notEqual(row.genre_family, 'Other');
  }
});

await test('broad-query Discogs placements remain medium confidence', () => {
  const broad = classified.filter((row) => cache.albums[row.spotify_album_id]?.matchMethod === 'broad-query');
  assert.ok(broad.length >= 8);
  assert.ok(broad.every((row) => row.genre_confidence === 'medium'));
  assert.ok(broad.every((row) => row.genre_evidence.includes('Discogs broad-query release match')));
});

await test('reviewed broad matches retain explicit positive evidence and reject the false Jajouka release', () => {
  assert.equal(reviewed.length, 5);
  for (const row of reviewed) {
    const decision = decisions.albums[row.spotify_album_id];
    assert.equal(decision?.action, 'override');
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
  const jajouka = rows.find((row) => row.spotify_album_id === '4bUk1m4hzKtdlp8knuxPw3');
  assert.equal(jajouka.genre_family, 'World');
  assert.equal(jajouka.genre_source, 'editorial:discogs-release-review/4bUk1m4hzKtdlp8knuxPw3');
  assert.ok(!jajouka.genre_source.endsWith('/831052'));
  assert.equal(decisions.albums[jajouka.spotify_album_id].rejectedDiscogsReleaseId, 831052);
});

await test('Discogs umbrella Folk, World, & Country genre never forces a Country placement', () => {
  for (const row of classified) {
    const evidence = cache.albums[row.spotify_album_id];
    const specificGenres = evidence.genres.filter((name) => !/^folk,?\s*world,?\s*(?:&|and)\s*country$/i.test(name));
    assert.ok(specificGenres.length > 0 || evidence.styles.length > 0, `${row.artist_names} uses only the ambiguous Discogs umbrella genre`);
  }
});

await test('Discogs World placements require positive regional or genre evidence', () => {
  const positive = /world(?: music)?|weltmusik|african|reggae|ska|latin|afrobeat|afrobeats|highlife|chimurenga|qawwali|raï|flamenco|bossa nova|samba|rumba|calypso|gamelan|cumbia|salsa|fado|klezmer|mariachi|axé|tango|chaabi|maloya|guadeloupe|soukous|rebetiko|laïko|arabic|turkish|chalga|bollywood|timba|greece|boogaloo|galicia|romani|zouk|indian classical|persian classical|hindustani classical|carnatic|hawaiian/i;
  for (const row of classified.filter((item) => item.genre_family === 'World')) assert.match(row.genre_evidence, positive);
});
