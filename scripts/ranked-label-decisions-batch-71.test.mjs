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
  ['5CCr8msaN3MhgqBoa9yWhH', ['Pop', 'Pop']],
]);

const retained = new Map([
  ['1orUgs2nNTHIVoqTbpO9dm', 'Electronic'], ['6rWPWP8A3c78e1UBXY0QSO', 'Electronic'],
  ['6pRfPC3TZvGie6emFW53xC', 'Electronic'], ['7gyuH6v1Pj2BlZWKumuW8n', 'World'],
  ['1UipKFYbqCb3jc0DEW7h93', 'World'], ['5aCfaR4jZ6SvKcn6fTikS8', 'World'],
  ['5nYpzwdaQTf8WcesC8gizD', 'World'], ['2FGZDrcHRf9jGMHGPI8cjx', 'World'],
  ['1LV5G400jD3Ytvyv6Dlkym', 'Electronic'],
]);

await test('batch 71 applies the exact PinkPantheress Pop correction', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-71/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
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

await test('retained World recordings carry positive named-style or repertoire evidence', () => {
  for (const trackId of ['7gyuH6v1Pj2BlZWKumuW8n', '1UipKFYbqCb3jc0DEW7h93', '5aCfaR4jZ6SvKcn6fTikS8', '5nYpzwdaQTf8WcesC8gizD', '2FGZDrcHRf9jGMHGPI8cjx']) {
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.match(group.rationale, /(Romanian tango|Cuban tropical|bullerengue|Afro-Pop|Tamil|Kollywood)/i);
  }
});

await test('batch 71 remains applied after later queue slices', () => {
  assert.ok(queue.length <= 75);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
