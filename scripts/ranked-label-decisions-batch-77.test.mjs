import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const queue = parse(fs.readFileSync(new URL('../data/ranked-label-conflict-review.csv', import.meta.url), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('../data/ranked-label-conflict-decisions.json', import.meta.url), 'utf8'));
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));

const corrected = new Map([
  ['1AQSmN6Qe7SLi11VzCsTPJ', ['Modern Folk', 'Contemporary Irish folk']],
  ['3H6E08h1mTs0CfkeuwnGs9', ['Modern Folk', 'Contemporary Irish folk']],
  ['3gc1kR9Y98HRIEwGGH8SKh', ['Modern Folk', 'Nordic folk']],
  ['60dBEoiKKDY47OIrhqfGeo', ['Rock', 'Folk-rock']],
  ['23w07u3kp1Q2UmDKOKgOnC', ['Jazz', 'Latin jazz']],
  ['5lN4zYDwWMTAtBvQRFtCSF', ['Rock', 'Alternative rock']],
  ['5ABKdZH1X4GRH7J0f1L7Vm', ['Modern Folk', 'Singer-songwriter']],
  ['3FBt52I3lgpZRA5MdYHQ16', ['World', 'Música popular brasileira']],
]);
const retained = new Map([
  ['2i3DEACw0TzM2oYO03RQtf', 'Traditional Folk'], ['56DERpWhpQqFRGs1o2lMeO', 'Traditional Folk'],
  ['22XHcea6uhw7nzohxrpROn', 'Traditional Folk'], ['4drSb27rNzeRhTB7oREnB7', 'Traditional Folk'],
  ['4RybMAgGy55SxtNsztO1aQ', 'World'], ['2CjGCepEkmxYIKt4onadvo', 'World'],
  ['4s4QmVmK4Zj3Mdj8F5GEM8', 'World'], ['2PHoztbskHG3MtRyTqSibw', 'Classical'],
  ['0ZPHNHNrvCmNRtzCexm9Vu', 'World'], ['7DNmrjsWPEN9lrpyq7upp1', 'World'],
  ['3qMjQLoHFTceSQKMxInHrD', 'Experimental'], ['4R8rtLIPQcrjnYvKOlqUON', 'World'],
  ['174jKEXkYC32L6nTxFdWAr', 'Electronic'], ['1cu5PHumWAqQf9M6BHQ8b7', 'Pop'],
  ['3X52M9KgW9IPpiIO5Ic20g', 'Country'], ['6O7DiDhXicGVAFB2uyIMBO', 'Modern Folk'],
]);

await test('batch 77 applies eight exact recording or work-level corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-77/track/${trackId}`);
  }
});

await test('sixteen exact product and repertoire decisions retain their parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(decisions.groups[decisions.tracks[trackId]].action, 'retain');
  }
});

await test('ranked-label review queue is fully closed', () => {
  assert.equal(queue.length, 0);
  assert.equal(Object.keys(decisions.tracks).length, 236);
});

await test('new World decision uses positive named MPB evidence', () => {
  const decision = decisions.groups[decisions.tracks['3FBt52I3lgpZRA5MdYHQ16']];
  assert.match(decision.rationale, /MPB|Brazilian genre/i);
  assert.doesNotMatch(decision.rationale, /nationality|origin alone/i);
});
