import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const decisions = JSON.parse(fs.readFileSync(new URL('data/every-noise-family-retains-batch-53.json', root), 'utf8'));
const review = parse(fs.readFileSync(new URL('data/every-noise-family-review.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });

await test('batch 53 closes exactly twenty false-positive audit disagreements without rewriting tracks', () => {
  const retained = review.filter((row) => row.review_status === 'reviewed-retain' && decisions.tracks[row.spotify_track_id]);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.equal(retained.length, 20);
  for (const [id, decision] of Object.entries(decisions.tracks)) {
    const canonical = rows.find((row) => row.spotify_track_id === id);
    const audited = retained.find((row) => row.spotify_track_id === id);
    assert.equal(decision.action, 'retain');
    assert.equal(canonical?.genre_family, decision.family);
    assert.equal(audited?.current_family, decision.family);
    assert.ok(!canonical?.genre_source.includes('batch-53'), `retain decision rewrote canonical row ${id}`);
    assert.ok(decision.evidence.includes(`https://open.spotify.com/track/${id}`));
  }
});

await test('reviewed World retains all carry positive named genre evidence', () => {
  const world = Object.values(decisions.tracks).filter((decision) => decision.family === 'World');
  assert.equal(world.length, 5);
  assert.ok(world.every((decision) => /chicha|corrido|música mexicana|gnawa|sholawat/i.test(`${decision.rationale} ${decision.evidence.join(' ')}`)));
});
