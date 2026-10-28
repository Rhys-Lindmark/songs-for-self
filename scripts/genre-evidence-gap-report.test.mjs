import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const report = JSON.parse(fs.readFileSync(new URL('../data/genre-evidence-gap-report.json', import.meta.url), 'utf8'));

await test('evidence-gap report proves the unresolved tail is empty', () => {
  assert.equal(report.unresolvedTracks, 0);
  assert.equal(report.items.length, 0);
  assert.equal(Object.values(report.tierCounts).reduce((sum, count) => sum + count, 0), 0);
  assert.ok(report.items.every((item) => item.evidenceTier && item.nextAction));
  assert.match(report.method, /never assign a genre/i);
});

await test('no unresolved identity or weak-catalog queues remain', () => {
  const missing = report.items.filter((item) => item.evidenceTier === 'identity-missing');
  const leads = report.items.filter((item) => item.evidenceTier === 'related-catalog-lead');
  assert.equal(missing.length, 0);
  assert.equal(leads.length, 0);
  assert.ok(missing.every((item) => !item.track || item.artists.includes('Unknown artist')));
  assert.ok(leads.every((item) => item.candidateFamily && item.candidateConfidence === 'low'));
});
