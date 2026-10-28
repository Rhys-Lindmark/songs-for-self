import assert from 'node:assert/strict';
import test from 'node:test';

import { timelineLeft, timelinePercent } from '../lib/timeline-scale.ts';

const allTime = { min: 1200, max: 2026 };
const recorded = { min: 1900, max: 2026 };

await test('all-time timeline coordinates are mathematically proportional', () => {
  const expected = new Map([
    [1200, 0],
    [1720, (520 / 826) * 100],
    [1900, (700 / 826) * 100],
    [2000, (800 / 826) * 100],
    [2026, 100],
  ]);
  for (const [year, percent] of expected) {
    assert.ok(Math.abs(timelinePercent(year, allTime) - percent) < 1e-10, `${year} should land at ${percent}%`);
  }
});

await test('recorded-era timeline begins at 1900 and ends at the current data year', () => {
  assert.equal(timelinePercent(1900, recorded), 0);
  assert.equal(timelinePercent(2000, recorded), (100 / 126) * 100);
  assert.equal(timelinePercent(2026, recorded), 100);
});

await test('the CSS coordinate is generated from the same scale', () => {
  assert.equal(timelineLeft(1200, allTime), '0%');
  assert.equal(timelineLeft(2026, allTime), '100%');
  assert.equal(timelineLeft(1900, recorded), '0%');
});

await test('invalid timeline ranges fail loudly', () => {
  assert.throws(() => timelinePercent(2000, { min: 2000, max: 2000 }), /greater than/);
  assert.throws(() => timelinePercent(Number.NaN, allTime), /finite/);
});
