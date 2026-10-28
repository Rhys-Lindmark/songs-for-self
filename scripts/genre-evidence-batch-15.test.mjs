import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-15.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-15/'));

await test('batch 15 resolves 25 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 25);
  assert.equal(Object.keys(decisions.tracks).length, 25);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  assert.ok(reviewed.every((row) => row.genre_evidence.startsWith('https://')));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.ok(decision, `Missing batch 15 decision for ${row.artist_names} — ${row.track_name}`);
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('archival traditional recordings retain explicit repertoire evidence', () => {
  const ids = ['2SAWOoDsgdXqeQihHVR4hL', '63Ix85QfTDiX72nYFqZruf', '1DfU2Nmxe1fD65sl1NDpeA', '4pYphWxLRSWDwvlmKoabTc', '36T4VQmxVAJTQRwzd3PkSw'];
  const archival = ids.map((id) => reviewed.find((row) => row.spotify_track_id === id));
  assert.ok(archival.every(Boolean));
  assert.ok(archival.every((row) => row.genre_family === 'Traditional Folk'));
  assert.ok(archival.every((row) => /folk|song|record|traditional|throat/i.test(row.genre_evidence)));
});

await test('World placements require positive cultural and genre evidence', () => {
  const world = reviewed.filter((row) => row.genre_family === 'World');
  const byId = (left, right) => left.localeCompare(right);
  assert.deepEqual(world.map((row) => row.spotify_track_id).sort(byId), ['1ZRvrv2Gg10Xuhb8ziBaxy', '5NDqvtpp4kynEjIm5ERdXG'].sort(byId));
  assert.ok(world.every((row) => /kabyle|iranian|middle eastern|world/i.test(row.genre_evidence)));
});

await test('the former weak catalog leads follow exact evidence instead', () => {
  const expected = new Map([
    ['4DkyOsnrOqCxQ6QzbIzcUz', 'Rock'],
    ['5L6qTogmzCykXZPsfWmaG1', 'Modern Folk'],
    ['0FQnoLszoFfa1VSxdvmbZT', 'Pop'],
    ['5mVUBslDV0QJjf0WJ4wL5P', 'Rock'],
    ['0ThHcb6tWbjPz8BD1377uA', 'Traditional Folk'],
    ['3Abd9MByJP9evB9ZBviL1N', 'Rock'],
    ['7p8kX7KUC83scRNlRj1ggm', 'Hip-hop'],
  ]);
  for (const [id, family] of expected) assert.equal(reviewed.find((row) => row.spotify_track_id === id)?.genre_family, family);
});
