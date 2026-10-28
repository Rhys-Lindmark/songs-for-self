import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-25.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-25/'));

await test('batch 25 resolves 20 exact singleton tracks without broad propagation', () => {
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

await test('batch 25 World decisions retain positive named-style evidence', () => {
  const worldIds = ['2lRICPUSr2OU2MLCqd91oQ', '7x4nvUtlqn1PWaiqGceqbc', '7GVOLSWbpurKAtMXwk2ym9', '0kiSxxV732MQ1Gs5zZkX5r'];
  for (const id of worldIds) {
    const decision = decisions.tracks[id];
    assert.equal(decision.family, 'World');
    assert.match(`${decision.primary} ${decision.secondary} ${decision.rationale}`, /raï|chaâbi|tango|electrotango|MPB|Brazilian|Algerian/i);
  }
});

await test("traditional repertoire remains distinct from modern folk and children's pop", () => {
  const traditionalIds = ['4P8HiB2lmBWEVgolHbEayS', '6Jr4sE1oBLp1F0VsdEkdmy', '2LAHWYioHw8jOrOsqFYbBs', '0ODwEzWnIWfdzrat0qOyFY', '2zGGKucZCKE0Uscj1m3DFT', '3lIdTDMFAFshQSa0pd0lVX'];
  assert.ok(traditionalIds.every((id) => decisions.tracks[id].family === 'Traditional Folk'));
  assert.equal(decisions.tracks['0V61I4Q7xq4wbzbsydkiIF'].family, 'Modern Folk');
  assert.equal(decisions.tracks['5nkdZVoxrPOOsLDOarEaVt'].family, 'Modern Folk');
  assert.equal(decisions.tracks['3EtEphYu9bikCNRRvk7PLH'].family, 'Pop');
});

await test('comedy mapping remains explicit and medium confidence', () => {
  const decision = decisions.tracks['1aGTrNh6TaQQlT3cHMcXgv'];
  assert.equal(decision.family, 'Pop');
  assert.equal(decision.confidence, 'medium');
  assert.match(decision.rationale, /requested taxonomy/i);
});
