import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));

const corrected = new Map([
  ['3TWFVp2w3O2RexDTLCybDQ', ['Pop', 'Latin pop']],
  ['49sMsFUxaaGDlaKZNBfVSd', ['Pop', 'Latin pop']],
  ['3em1RbbyrkC6gHABM1GotM', ['Pop', 'French pop / chanson']],
  ['1EMNrP8rjPC5bl5snp09k9', ['Pop', 'French pop / chanson']],
]);

const retainedWorld = [
  '5A32KQZznC2HSqr9qzTl2N', '3QHMxEOAGD51PDlbFPHLyJ',
  '0WFVkJD7uSzfvALjVCSBcn', '5BZUBru6V1SlfoxBsAZwZG',
  '6UN6W5tj0qrMYV8N9MQMJC', '2T843kQT0bYF8fa5J9vOB4',
];

await test('batch 63 applies four exact Latin-pop and French-pop corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-63/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('six salsa, Colombian traditional, and ranchera recordings retain World', () => {
  for (const trackId of retainedWorld) {
    assert.equal(byId.get(trackId)?.genre_family, 'World');
    assert.equal(queued.has(trackId), false);
  }
});

await test('ranked-label queue falls to 155 with no high-priority rows', () => {
  assert.ok(queue.length <= 155);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
