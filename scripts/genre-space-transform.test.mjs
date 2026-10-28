import assert from 'node:assert/strict';
import test from 'node:test';

import { pinchTransform } from '../lib/genre-space-transform.ts';

await test('pinch zoom preserves the musical point beneath the gesture midpoint', () => {
  const startScale = 2;
  const startOffset = { x: 0.08, y: -0.04 };
  const center = { x: 0.7, y: 0.3 };
  const result = pinchTransform({ startScale, startOffset, center, startDistance: 100, distance: 175 });
  const musicalX = (center.x - 0.5 - startOffset.x) / startScale;
  const musicalY = (center.y - 0.5 - startOffset.y) / startScale;
  assert.ok(Math.abs((musicalX * result.scale + 0.5 + result.offset.x) - center.x) < 1e-12);
  assert.ok(Math.abs((musicalY * result.scale + 0.5 + result.offset.y) - center.y) < 1e-12);
});

await test('pinch zoom respects the 1x to 8x semantic-zoom bounds', () => {
  assert.equal(pinchTransform({ startScale: 2, startOffset: { x: 0, y: 0 }, center: { x: 0.5, y: 0.5 }, startDistance: 100, distance: 1 }).scale, 1);
  assert.equal(pinchTransform({ startScale: 2, startOffset: { x: 0, y: 0 }, center: { x: 0.5, y: 0.5 }, startDistance: 100, distance: 1000 }).scale, 8);
});
