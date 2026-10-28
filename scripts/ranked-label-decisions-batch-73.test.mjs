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
  ['5EAbUR2kkfDOCWEcWcb7YG', ['Pop', 'Pop']], ['4wRbUz7hoMZBZZhGZyV28t', ['Pop', 'French pop']],
  ['3ZE3wv8V3w2T2f7nOCjV0N', ['Rock', 'Art rock']], ['0uPbGYrOp7Svg1eyJsE3Hx', ['Rock', 'Blues rock']],
]);
const retained = new Map([
  ['5N4h1zMpCg3mfvHctvQfuU', 'Electronic'], ['78His8pbKjbDQF7aX5asgv', 'World'],
  ['1pmnRWyl6HdWtraKmMe3gz', 'World'], ['7foxbfQu0yEXFOrqGl0VIw', 'World'],
  ['7tj8DG5zoZE1doGtkseEdy', 'Country'], ['34yg9VNqMh8WLKCAipKXgO', 'Pop'],
]);

await test('batch 73 applies four exact Pop and Rock corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-73/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('six exact catalog decisions retain their source-backed parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.length >= 2);
  }
});

await test('World retains use positive reggae, Xhosa Afro-folk, or desert-blues evidence', () => {
  for (const trackId of ['78His8pbKjbDQF7aX5asgv', '1pmnRWyl6HdWtraKmMe3gz', '7foxbfQu0yEXFOrqGl0VIw']) {
    assert.match(decisions.groups[decisions.tracks[trackId]].rationale, /(reggae|Xhosa Afro-folk|desert blues)/i);
  }
});

await test('batch 73 remains applied after later queue slices', () => {
  assert.ok(queue.length <= 55);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
