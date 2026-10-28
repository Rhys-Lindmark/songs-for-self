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
  ['6TIl8IznVjlHKu1HD596yi', ['Electronic', 'Electronica']], ['4ymUrXLLm7xzZQ6Rv0ouUK', ['Electronic', 'Electropop']],
  ['4cuyvpfIldUaXtftFNfPVu', ['Hip-hop', 'Alternative hip-hop']], ['5GdNfIicmCrLYiBY4Y9Vr3', ['Electronic', 'Electronic funk']],
]);
const retained = new Map([
  ['5Phe35xgdkRSxTdM4MAVIk', 'Pop'], ['1ZHfMFfKdpFmAIAXIWK9LH', 'World'],
  ['4UJsdwu3pF77BPFoc0q2RE', 'World'], ['1D6WYzXle2Mq1k9I3AUQQv', 'World'],
  ['2hspCATOKb9llyIeMik89G', 'World'], ['3zPRPxatgm9m86wIRw6lut', 'R&B, Soul & Blues'],
]);

await test('batch 75 applies four exact recording-family corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-75/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('six exact catalog decisions retain their source-backed parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    assert.equal(decisions.groups[decisions.tracks[trackId]].action, 'retain');
  }
});

await test('regional retains use positive named genres rather than geography', () => {
  for (const trackId of ['1ZHfMFfKdpFmAIAXIWK9LH', '4UJsdwu3pF77BPFoc0q2RE', '1D6WYzXle2Mq1k9I3AUQQv', '2hspCATOKb9llyIeMik89G']) {
    assert.match(decisions.groups[decisions.tracks[trackId]].rationale, /(Afro-samba|pagode|boogaloo|música tropical|salsa|mambo|son cubano)/i);
  }
});

await test('ranked-label queue stays at or below the batch-75 ceiling with only low-priority rows', () => {
  assert.ok(queue.length <= 35);
  assert.equal(queue.filter((row) => row.review_priority !== 'low').length, 0);
});
