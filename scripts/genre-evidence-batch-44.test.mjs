import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-44.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-44/'));

await test('batch 44 resolves ten exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 10);
  assert.equal(Object.keys(decisions.tracks).length, 10);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('exact store and artist-uploaded release genres receive high confidence', () => {
  for (const id of ['4Dll52TVxAXPcoS0s82Flv', '2AVbyVucpb1v5DyZsAoZQL', '13apq4VoMmOpOPBOb9sP8Z', '6hc3OOojm3L9AjtxDLxMYK', '7qDxMpPL1iJrtoVNPFAlvi', '3c7o3PtgobujO2OFegNYFw']) {
    assert.equal(decisions.tracks[id].confidence, 'high');
  }
});

await test('catalog-adjacent and conflict-resolution calls remain visibly medium confidence', () => {
  for (const id of ['3mFGMe7Mq713DCYTVNQp5d', '5UyDuO6mE3vKMrq9CiJ0Vs', '66UJXjGUJbbFHbTDLSpcV9', '3Y71vmEaVfmTmt167azrjn']) {
    assert.equal(decisions.tracks[id].confidence, 'medium');
  }
});

await test('batch uses requested taxonomy parents and does not infer World from identity', () => {
  assert.equal(decisions.tracks['3mFGMe7Mq713DCYTVNQp5d'].family, 'R&B, Soul & Blues');
  assert.equal(decisions.tracks['5UyDuO6mE3vKMrq9CiJ0Vs'].family, 'Modern Folk');
  assert.ok(Object.values(decisions.tracks).every((decision) => decision.family !== 'World'));
});
