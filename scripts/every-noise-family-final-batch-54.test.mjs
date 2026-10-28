import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const corrections = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-54.json', root), 'utf8'));
const retains = JSON.parse(fs.readFileSync(new URL('data/every-noise-family-retains-batch-54.json', root), 'utf8'));
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const review = parse(fs.readFileSync(new URL('data/every-noise-family-review.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });

await test('batch 54 applies eight exact corrections and leaves thirteen retains canonical', () => {
  assert.equal(Object.keys(corrections.tracks).length, 8);
  assert.equal(Object.keys(retains.tracks).length, 13);
  for (const [id, decision] of Object.entries(corrections.tracks)) {
    const row = rows.find((entry) => entry.spotify_track_id === id);
    assert.equal(row?.genre_family, decision.family);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-54/track/${id}`);
    assert.ok(decision.evidence.includes(`https://open.spotify.com/track/${id}`));
  }
  for (const [id, decision] of Object.entries(retains.tracks)) {
    const row = rows.find((entry) => entry.spotify_track_id === id);
    assert.equal(row?.genre_family, decision.family);
    assert.ok(!row?.genre_source.includes('batch-54'));
  }
});

await test('the actionable Every Noise disagreement queue is complete', () => {
  assert.equal(review.filter((row) => row.review_status === 'disagree').length, 0);
  assert.equal(review.filter((row) => row.review_status === 'reviewed-retain').length, 33);
  assert.equal(review.filter((row) => row.review_status === 'reviewed-correct').length, 3);
});

await test('batch 54 World changes use positive named recording genres', () => {
  const world = Object.values(corrections.tracks).filter((decision) => decision.family === 'World');
  assert.equal(world.length, 4);
  assert.ok(world.every((decision) => /highlife|bolero|balkan|salsa|son cubano/i.test(`${decision.primary} ${decision.secondary} ${decision.rationale}`)));
});
