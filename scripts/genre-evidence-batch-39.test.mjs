import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-39.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-39/'));

await test('batch 39 resolves eight exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 8);
  assert.equal(Object.keys(decisions.tracks).length, 8);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('World decisions require positive named regional genres', () => {
  assert.match(decisions.tracks['2knFLEmH9MvqejvIEIqkpo'].rationale, /positive named regional genre evidence/i);
  assert.match(decisions.tracks['6ntLbCMKOufkozC8YJrb0g'].rationale, /positive genre evidence for World/i);
  assert.equal(decisions.tracks['2knFLEmH9MvqejvIEIqkpo'].primary, 'Highlife');
  assert.equal(decisions.tracks['6ntLbCMKOufkozC8YJrb0g'].primary, 'Bhangra');
});

await test('adjacent release and composition mappings stay medium confidence', () => {
  assert.equal(decisions.tracks['7MTw7KQGZP9OhHN1QkPyft'].confidence, 'medium');
  assert.equal(decisions.tracks['7utz5lbzPux9ptmVOLWj2T'].confidence, 'medium');
});

await test('Petey decisions retain multiple independent exact-release sources', () => {
  for (const id of ['0LoPTaZcdmvin7vlRhFEI0', '4C1vFlHxwtnzj58n7ML8FI']) {
    assert.equal(decisions.tracks[id].family, 'Rock');
    assert.ok(decisions.tracks[id].evidence.length >= 3);
  }
});
