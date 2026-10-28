import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-23.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-23/'));

await test('batch 23 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
  for (const row of reviewed) {
    const decision = decisions.tracks[row.spotify_track_id];
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('traditional repertoire and authored modern folk remain distinct', () => {
  for (const id of ['4NFhb4AOPBulDFgxyoXaLH', '40Ti87ofO5JW9S3YXttAPp', '1RP8BjsESg7dm74z52mQC4']) {
    assert.equal(reviewed.find((row) => row.spotify_track_id === id)?.genre_family, 'Traditional Folk');
  }
  assert.equal(reviewed.find((row) => row.spotify_track_id === '19pFXtUnA0Nb6oSuIPDPOL')?.genre_family, 'Modern Folk');
});

await test('soundtrack and comedy product mappings remain explicit', () => {
  for (const id of ['1xOufOKaxfBlxG6l7ytHZ0', '6iy41EHSt1KhsijQDqm1iF', '2bQ1nNJqEk5PdymJEHdG81', '1hJn2Nq2XroqUOtysn3xet']) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'Pop');
    assert.match(decision.rationale, /taxonomy|requested/i);
  }
});

await test('adjacent-release decisions remain medium confidence and track scoped', () => {
  const mediumIds = ['3v6sBj3swihU8pXQQHhDZo', '7teEp4468N67NMCeYKPsOt', '3FXnYoG0ePZGuXawLi50Q9', '4yMCqZ7OxuLtYDsHsIFS9l'];
  assert.ok(mediumIds.every((id) => decisions.tracks[id].confidence === 'medium'));
  assert.ok(mediumIds.every((id) => reviewed.find((row) => row.spotify_track_id === id)?.genre_source.endsWith(`/track/${id}`)));
});
