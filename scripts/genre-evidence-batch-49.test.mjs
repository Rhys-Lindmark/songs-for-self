import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-49.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-49/'));

await test('batch 49 corrects exactly thirteen source-addressable tracks without artist propagation', () => {
  assert.equal(reviewed.length, 13);
  assert.equal(Object.keys(decisions.tracks).length, 13);
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`) && row.genre_confidence === 'medium'));
  assert.ok(Object.entries(decisions.tracks).every(([id, decision]) => decision.evidence.includes(`https://open.spotify.com/track/${id}`)));
  assert.equal(reviewed.find((row) => row.spotify_track_id === '7vt7cUdUhOce1aYrULANus')?.genre_family, 'Rock', 'latest track-scoped correction should supersede the older batch 28 call');
});

await test('every decision uses a source page emitted by the current Every Noise membership bridge', () => {
  const memberships = JSON.parse(fs.readFileSync(new URL('data/every-noise-artist-memberships.json', root), 'utf8')).artists;
  const byId = new Map(rows.map((row) => [row.spotify_track_id, new Set(row.spotify_artist_ids.split(';').flatMap((artistId) => memberships[artistId]?.sourcePages ?? []))]));
  for (const [id, decision] of Object.entries(decisions.tracks)) {
    const bridgeSources = byId.get(id);
    assert.ok(bridgeSources?.size, `missing artist-membership sources for ${id}`);
    assert.ok(decision.evidence.filter((url) => url.startsWith('https://noteverynoise.com/')).every((url) => bridgeSources.has(url)), `unpublished bridge source on ${id}`);
  }
});

await test('World corrections retain positive named regional genre evidence and remove the Latin-pop false positive', () => {
  const worldIds = ['7Jq0pQrsJqNiYUMD3MfOxy', '6Ax5UCbftxzcjJ8cg3WtFT', '64poqU1ti12SA7i9NVumwj'];
  assert.ok(worldIds.every((id) => decisions.tracks[id].family === 'World'));
  assert.ok(worldIds.every((id) => /chicha|calypso/i.test(`${decisions.tracks[id].primary} ${decisions.tracks[id].rationale}`)));
  assert.equal(decisions.tracks['7lnun6viJADQCvZnE0w9q8'].family, 'Pop');
});
