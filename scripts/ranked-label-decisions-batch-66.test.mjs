import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('../data/ranked-label-conflict-decisions.json', import.meta.url), 'utf8'));
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));

const retained = new Map([
  ['1bUGTs7EkTJKjyKKdhlYy8', 'Experimental'],
  ['0u04X3Czw2Z6bLeSVogNVl', 'Jazz'],
  ['74Btnf4popVsOrFCdpqUgf', 'Jazz'],
  ['69yQ3cbo6zf8kzpYrlU5nE', 'Electronic'],
  ['2dJerArfA2AzccXWflnw9G', 'Electronic'],
  ['2WwYvc2MpU5hFSvSZfT96C', 'Electronic'],
  ['6kBik3sxfEP0iCtuuG2PdX', 'Electronic'],
  ['0WAKFcVVPkZboGEZcT4r73', 'Electronic'],
  ['1DgdS4TH8eyWSJNz8yR7vT', 'Electronic'],
]);

await test('batch 66 moves the exact Alex Metric remix to Electronic', () => {
  const trackId = '0qlYPfEfpOG0DcqdKBvOBF';
  const row = byId.get(trackId);
  assert.equal(row?.genre_family, 'Electronic');
  assert.equal(row?.genre_primary, 'Nu-disco');
  assert.equal(row?.genre_source, `editorial:genre-evidence-batch-66/track/${trackId}`);
  assert.equal(queued.has(trackId), false);
  assert.match(row?.genre_evidence ?? '', /Beatport|Nu Disco/i);
});

await test('nine exact crossover recordings retain direct catalog parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
  }
});

await test('ranked-label queue remains at or below the batch-66 threshold with no high-priority rows', () => {
  assert.ok(queue.length <= 125);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
