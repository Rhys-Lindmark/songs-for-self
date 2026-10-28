import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const queue = JSON.parse(fs.readFileSync(new URL('../data/genre-singleton-review-queue.json', import.meta.url), 'utf8'));

await test('singleton review queue is empty and non-mutating after zero-Other', () => {
  assert.equal(queue.unresolvedTracks, 0);
  assert.equal(queue.strictSingletonTracks, queue.queue.length);
  assert.ok(queue.queue.every((item, index) => item.rank === index + 1));
  assert.ok(queue.queue.every((item) => item.currentSource && item.evidenceGap));
  assert.match(queue.method, /not applied/i);
});

await test('weak or conflicting catalog signals never become confident genre decisions', () => {
  assert.ok(queue.queue.every((item) => ['medium', 'low', 'unresolved'].includes(item.candidateConfidence)));
  assert.ok(queue.queue.every((item) => item.candidateConfidence !== 'medium' || item.candidateSignal.support >= 3));
  assert.ok(queue.queue.every((item) => item.candidateConfidence !== 'medium' || item.candidateSignal.share >= 0.8));
  assert.ok(queue.queue.every((item) => item.candidateFamily !== 'World' || item.candidateConfidence === 'low'));
  assert.ok(queue.queue.every((item) => item.candidateFamily || item.candidateConfidence === 'unresolved'));
});
