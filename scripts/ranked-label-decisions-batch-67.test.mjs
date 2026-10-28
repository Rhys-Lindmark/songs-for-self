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
  ['59D9kPGmylqVmHnz1GsL8m', ['Pop', 'Holiday pop']],
  ['1dizvxctg9dHEyaYTFufVi', ['Hip-hop', 'G-funk']],
  ['6agO9tPEXgoXeh0p2wTD5U', ['Hip-hop', 'Hip-hop instrumental']],
  ['5HQVUIKwCEXpe7JIHyY734', ['Hip-hop', 'Pop rap']],
  ['2pucr6x078XuZbNLy8N8PA', ['Hip-hop', 'Grime']],
]);

const retained = new Map([
  ['27R1T1eeGS42YwsaIW6O0D', 'World'],
  ['0bhnFakmRioZbuQcmhVwoH', 'Electronic'],
  ['0TU5tjEaLsQVxp1vrmO6UW', 'World'],
  ['74GBtgq1XjVrNdp5Lv1jbM', 'World'],
  ['5q9E3jb5rjHBcDtDWFxtbM', 'R&B, Soul & Blues'],
]);

await test('batch 67 applies five exact recording-family corrections', () => {
  for (const [trackId, [family, primary]] of corrected) {
    const row = byId.get(trackId);
    assert.equal(row?.genre_family, family);
    assert.equal(row?.genre_primary, primary);
    assert.equal(row?.genre_source, `editorial:genre-evidence-batch-67/track/${trackId}`);
    assert.equal(queued.has(trackId), false);
  }
});

await test('five regional or production-led crossover recordings retain sourced parents', () => {
  for (const [trackId, family] of retained) {
    assert.equal(byId.get(trackId)?.genre_family, family);
    assert.equal(queued.has(trackId), false);
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.equal(group.action, 'retain');
    assert.ok(group.evidence.every((url) => url.startsWith('https://')));
  }
});

await test('batch 67 preserves positive evidence for every retained World recording', () => {
  for (const trackId of ['27R1T1eeGS42YwsaIW6O0D', '0TU5tjEaLsQVxp1vrmO6UW', '74GBtgq1XjVrNdp5Lv1jbM']) {
    const group = decisions.groups[decisions.tracks[trackId]];
    assert.match(group.rationale, /Balkan|bossa nova|salsa|regional|Música tropical/i);
    assert.doesNotMatch(group.rationale, /nationality alone|geography alone/i);
  }
});

await test('ranked-label queue remains at or below the batch-67 threshold with no high-priority rows', () => {
  assert.ok(queue.length <= 115);
  assert.equal(queue.filter((row) => row.review_priority === 'high').length, 0);
});
