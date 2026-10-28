import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('../data/ranked-label-conflict-decisions.json', import.meta.url), 'utf8'));

await test('ranked-label review queue is source-addressable and non-mutating when open', () => {
  assert.ok(rows.length > 0 || Object.keys(decisions.tracks).length === 236);
  assert.ok(rows.every((row) => row.spotify_track_id && row.spotify_url === `https://open.spotify.com/track/${row.spotify_track_id}`));
  assert.ok(rows.every((row) => row.current_family && row.candidate_family && row.current_family !== row.candidate_family));
  assert.ok(rows.every((row) => row.candidate_labels && row.reference_sources && /Candidate only/i.test(row.review_note)));
  assert.ok(rows.every((row) => ['high', 'medium', 'low'].includes(row.review_priority)));
  assert.ok(rows.every((row) => Number(row.artist_candidate_tracks) >= 1));
});

await test('queue is sorted into coherent artist review clusters', () => {
  const rank = { high: 0, medium: 1, low: 2 };
  for (let index = 1; index < rows.length; index += 1) {
    assert.ok(rank[rows[index - 1].review_priority] <= rank[rows[index].review_priority]);
  }
  if (rows.length === 0) {
    assert.equal(Object.keys(decisions.tracks).length, 236);
    return;
  }
  const top = rows[0];
  assert.equal(top.review_priority, 'low');
  assert.equal(rows.filter((row) => row.review_priority !== 'low').length, 0);
  for (const row of rows) {
    const groupSize = rows.filter((candidate) => candidate.artist_names === row.artist_names
      && candidate.current_family === row.current_family
      && candidate.candidate_family === row.candidate_family).length;
    assert.equal(groupSize, Number(row.artist_candidate_tracks));
  }
});

await test('queue excludes placements with direct support for their current family', () => {
  const payload = JSON.parse(fs.readFileSync(new URL('../public/genre-space-data.json', import.meta.url), 'utf8'));
  const queued = new Set(rows.map((row) => row.spotify_track_id));
  const crossoverExamples = payload.points.filter((point) =>
    point.referenceGenres.some((label) => /(^|\b)(jazz|country|traditional folk)(\b|$)/i.test(label))
    && ['Jazz', 'Country', 'Traditional Folk'].includes(point.family));
  assert.ok(crossoverExamples.length > 0);
  assert.ok(crossoverExamples.every((point) => !queued.has(point.id)));
});

await test('completed Kendrick and Johnny corrections do not return as candidates', () => {
  const corrected = new Set(['2zz8599zFWbCxlapmnWeAQ', '28cnXtME493VX9NOw9cIUh', '3RkQ3UwOyPqpIiIvGVewuU', '4uYwlMp841PLJmj1gJJwIq']);
  assert.ok(rows.every((row) => !corrected.has(row.spotify_track_id)));
});

await test('reviewed exact-track decisions stay out of the actionable queue', () => {
  const queued = new Set(rows.map((row) => row.spotify_track_id));
  assert.ok(Object.keys(decisions.tracks).length > 0);
  assert.ok(Object.keys(decisions.tracks).every((trackId) => !queued.has(trackId)));
  assert.equal(rows.filter((row) => row.review_priority === 'high').length, 0);
});

await test('reviewed groups retain source-bearing rationales and valid actions', () => {
  for (const [trackId, groupId] of Object.entries(decisions.tracks)) {
    assert.match(trackId, /^[A-Za-z0-9]{22}$/);
    assert.ok(decisions.groups[groupId], `missing decision group ${groupId}`);
  }
  for (const group of Object.values(decisions.groups)) {
    assert.ok(['retain', 'correct'].includes(group.action));
    assert.ok(group.currentFamily && group.candidateFamily && group.currentFamily !== group.candidateFamily);
    assert.ok(group.evidence.length >= 2);
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
    assert.ok(group.rationale.length >= 80);
    if (group.action === 'correct') assert.ok(group.family);
  }
});
