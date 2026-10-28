import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('../data/ranked-label-conflict-decisions.json', import.meta.url), 'utf8'));
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));
const queued = new Set(queue.map((row) => row.spotify_track_id));

const corrected = new Map([
  ['1SGcSxVxrsub49OZ6nHVKH', ['Modern Folk', 'Singer-songwriter']], ['6iGojU5pISv3JaJf2AHiCf', ['Modern Folk', 'Modern folk']],
  ['6weZWR2OyNDvoOZlsPCIPf', ['Rock', 'Post-punk']], ['5jQQSl7Uae4S8mlRkR4W8j', ['Rock', 'Alternative rock']],
  ['1Vchex0xowRj9k59RLvRfo', ['Pop', 'Pop']], ['2bUUMb6Xo8G1hhBjzXlb5b', ['Electronic', 'Acid house']],
  ['2Qwp9Gjnwq7wnMTQKrWXWD', ['Electronic', 'Electronic game soundtrack']], ['6PrPWf02VxGUd2jJLs9z1M', ['Electronic', 'Industrial techno']],
]);
const retained = new Map([['70Ct1sCesOWW1hqvjYqwBg', 'Country'], ['373lax965JHGRtIOFjVI3s', 'Country']]);

await test('batch 74 applies eight exact recording-family corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-74/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('two exact Country and Americana products retain Country', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    assert.equal(decisions.groups[decisions.tracks[trackId]].action, 'retain');
  }
});

await test('Sumo correction removes unsupported World while retaining reggae as detail', () => {
  const row = byId.get('6weZWR2OyNDvoOZlsPCIPf');
  assert.equal(row.genre_family, 'Rock');
  assert.match(row.genre_secondary, /reggae/i);
});

await test('batch 74 remains applied after later queue slices', () => {
  assert.ok(queue.length <= 45);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
