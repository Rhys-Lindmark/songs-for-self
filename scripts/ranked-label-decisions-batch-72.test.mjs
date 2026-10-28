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
  ['11ZJb66Ag7gjTmLBKF8ZuZ', 'Electronic'], ['4RJHa0uZqGV4bGyKQe2wcM', 'Electronic'],
  ['3FUZpoj9VV0sgc8RqbS3xQ', 'Electronic'], ['1ShWHEgisDGPl9G3g85ANu', 'Electronic'],
  ['0trTpNYmHAK3EihaZBd2h6', 'Electronic'], ['0ityftvFzPVMrY1xqyrooH', 'Electronic'],
  ['7210gUfSMVJ7ngS65IBR7g', 'Electronic'], ['3465azIEw57PcmownJb6ly', 'World'],
  ['4Wpwt4qpxrZ7aJNQzAA4l5', 'Electronic'],
]);

await test('batch 72 applies the exact Wham! Pop correction', () => {
  const trackId = '0ikz6tENMONtK6qGkOrU3c';
  const row = byId.get(trackId);
  assert.equal(row?.genre_family, 'Pop');
  assert.equal(row?.genre_primary, 'Pop');
  assert.equal(row?.genre_source, `editorial:genre-evidence-batch-72/track/${trackId}`);
  assert.equal(queued.has(trackId), false);
});

await test('nine exact catalog decisions retain their source-backed parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.length >= 2);
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
  }
});

await test('retained World recording carries positive named-style evidence', () => {
  const group = decisions.groups[decisions.tracks['3465azIEw57PcmownJb6ly']];
  assert.match(group.rationale, /(Latin|bossa nova)/i);
});

await test('batch 72 remains applied after later queue slices', () => {
  assert.ok(queue.length <= 65);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
