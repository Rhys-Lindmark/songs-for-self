import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-52.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-52/'));

await test('batch 52 corrects exactly fourteen source-addressable tracks without artist propagation', () => {
  assert.equal(reviewed.length, 14);
  assert.equal(Object.keys(decisions.tracks).length, 14);
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`) && row.genre_confidence === 'medium'));
  assert.ok(Object.entries(decisions.tracks).every(([id, decision]) => decision.evidence.includes(`https://open.spotify.com/track/${id}`)));
});

await test('every batch 52 genre page comes from the current Every Noise membership bridge', () => {
  const memberships = JSON.parse(fs.readFileSync(new URL('data/every-noise-artist-memberships.json', root), 'utf8')).artists;
  const byId = new Map(rows.map((row) => [row.spotify_track_id, new Set(row.spotify_artist_ids.split(';').flatMap((artistId) => memberships[artistId]?.sourcePages ?? []))]));
  for (const [id, decision] of Object.entries(decisions.tracks)) {
    const bridgeSources = byId.get(id);
    assert.ok(bridgeSources?.size, `missing artist-membership sources for ${id}`);
    assert.ok(decision.evidence.filter((url) => url.startsWith('https://noteverynoise.com/')).every((url) => bridgeSources.has(url)), `unpublished bridge source on ${id}`);
  }
});

await test('World corrections have positive named genre evidence rather than geography-only inference', () => {
  const worldDecisions = Object.values(decisions.tracks).filter((decision) => decision.family === 'World');
  assert.equal(worldDecisions.length, 7);
  assert.ok(worldDecisions.every((decision) => /bhajan|funk carioca|boogaloo|salsa|son cubano|afrobeat/i.test(`${decision.primary} ${decision.secondary} ${decision.rationale}`)));
  assert.equal(decisions.tracks['4Uhu3px9duL1e7Xzcnepdk'].family, 'Traditional Folk');
  assert.equal(decisions.tracks['6BWwOL0DEK1aLaDjyipjZj'].family, 'Electronic');
});
