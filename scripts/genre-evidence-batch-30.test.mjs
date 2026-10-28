import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-30.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-30/'));

await test('batch 30 resolves 20 exact singleton tracks without broad propagation', () => {
  assert.equal(reviewed.length, 20);
  assert.equal(Object.keys(decisions.tracks).length, 20);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_source.endsWith(`/track/${row.spotify_track_id}`)));
});

await test('batch 30 World placements retain named regional or repertoire evidence', () => {
  for (const id of ['5kxRXQqLVv03dNNiaaARqc', '3KpwXsmm3lid47KMCELsGc', '2EtMSByHEY4Wcn9iuFnZ2u', '6e9DsmmmGDb8ktII3TVVic', '0OtxAI8D28Ux6vjRRK6u6J']) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /Middle Eastern|Turkish|Afro-Peruvian|festejo|Latin|Fiji|Fijian/i);
  }
});

await test('American Palm Wine Boys recording follows singer-songwriter evidence, not its title', () => {
  const decision = decisions.tracks['4umpovSgQjcS2Cea9o01JA'];
  assert.equal(decision.family, 'Modern Folk');
  assert.match(decision.rationale, /not.*World|title/i);
});

await test('traditional repertoire remains separate from authored modern folk', () => {
  assert.equal(decisions.tracks['66Tpryh8kkQyXfKnHDFlM7'].family, 'Traditional Folk');
  assert.equal(decisions.tracks['3qWabhIKoMiAHeVEBGI4WV'].family, 'Traditional Folk');
  assert.equal(decisions.tracks['25CbIghO8RwlMI9s2nSHCp'].family, 'Modern Folk');
});
