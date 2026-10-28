import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/every-noise-family-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });

await test('Every Noise artist-membership family review reconciles the bridge slice without auto-applying decisions', () => {
  assert.equal(rows.length, 95);
  assert.equal(rows.filter((row) => row.review_status === 'agree').length, 59);
  assert.equal(rows.filter((row) => row.review_status === 'reviewed-retain').length, 33);
  assert.equal(rows.filter((row) => row.review_status === 'reviewed-correct').length, 3);
  assert.equal(rows.filter((row) => row.review_status === 'disagree').length, 0);
  assert.ok(rows.every((row) => row.spotify_track_id && row.current_family && row.artist_membership_candidate_family && row.reference_genres && row.reference_sources));
  assert.ok(rows.filter((row) => row.review_status === 'disagree' && row.artist_membership_candidate_family === 'World').every((row) => /positive named regional/i.test(row.review_note)));
  assert.ok(rows.every((row) => row.review_status !== 'disagree' || /Manual|do not auto-apply/i.test(row.review_note)));
});
