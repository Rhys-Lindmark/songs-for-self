import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-27.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-27/'));

await test('batch 27 retains nineteen active placements while later exact evidence supersedes Harper Bloom', () => {
  assert.equal(reviewed.length, 19);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.equal(rows.find((row) => row.spotify_track_id === '2GaNZedsPuffC39LiKwGau')?.genre_source, 'editorial:genre-evidence-batch-68/track/2GaNZedsPuffC39LiKwGau');
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('batch 27 World decisions retain positive named regional or repertoire evidence', () => {
  const worldIds = ['4eYehD5DLfNqGDIMeo4QGL', '1CG9FhSDv5nfC4PE63pAGH', '2nW8M55ESt2gsWQrCDcJKi'];
  for (const id of worldIds) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /Congolese|soukous|Brazil|maracatu|forró|brega|India|Indian|ballad/i);
  }
});

await test('regional identity does not override pop and funk recording evidence', () => {
  assert.equal(decisions.tracks['0HCPSd4xNAu3MnXyXGHwzg'].family, 'Pop');
  assert.equal(decisions.tracks['2o8MYdtYZYidgpe9oIGIcy'].family, 'R&B, Soul & Blues');
  assert.match(decisions.tracks['0HCPSd4xNAu3MnXyXGHwzg'].rationale, /rather than.*World/i);
});

await test('medium-confidence catalog and product mappings remain explicit', () => {
  const mediumIds = ['3pR6Jqggiu36LQYDvd8nL3', '0lCTHchsho2nDL1k1Tug7l'];
  assert.ok(mediumIds.every((id) => decisions.tracks[id].confidence === 'medium'));
});
