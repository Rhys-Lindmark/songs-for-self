import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-26.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-26/'));
const byId = new Map(rows.filter((row) => row.spotify_track_id).map((row) => [row.spotify_track_id, row]));

await test('batch 26 retains nineteen active rows while a later exact remix review supersedes Nyako', () => {
  assert.equal(reviewed.length, 19);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('the exact Daisho remix now follows direct House evidence', () => {
  const row = byId.get('4kAkohiTAshEC8dZt8IDWp');
  assert.equal(row?.genre_family, 'Electronic');
  assert.match(row?.genre_source ?? '', /batch-65/);
});

await test('batch 26 World decisions retain positive named regional or repertoire evidence', () => {
  const worldIds = ['0JY5WcGswVtuzCGZ1LKFdn', '1xb4uv25MokAY9xos31WXL', '0dYcm4egqQmFDr4mjjFVIF', '4kAkohiTAshEC8dZt8IDWp', '5NReDB6HmsA5rXmdmnnsSO', '0UEP4zRu8nOZ9wopxJLXVO'];
  for (const id of worldIds) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /Kurd|Kizomba|Turkish|Islam|benga|Afro|Colombia|porro|cumbia|baile funk|Brazil/i);
  }
});

await test('authored singer-songwriters and traditional repertoire stay separate', () => {
  const modernFolkIds = ['7KyNDAKwIC3x3GEEVVdxVv', '2lXNibPcBjxEqtMfV15Mv2', '58kOPN9mNo8tQecl2jstoH'];
  const traditionalIds = ['7imEUNt6Sdp5bVHNxVbM4P', '3gWApj1XdnAxvGuD4PYVdv'];
  assert.ok(modernFolkIds.every((id) => decisions.tracks[id].family === 'Modern Folk'));
  assert.ok(traditionalIds.every((id) => decisions.tracks[id].family === 'Traditional Folk'));
});

await test('medium-confidence mappings remain explicit', () => {
  const mediumIds = ['7uznQ5awbNEnPoAcX5GBxb', '0t8vGVdJaU93uQYMNqViyf'];
  assert.ok(mediumIds.every((id) => decisions.tracks[id].confidence === 'medium'));
});
