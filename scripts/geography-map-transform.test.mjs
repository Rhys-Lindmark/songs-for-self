import assert from 'node:assert/strict';
import test from 'node:test';
import { focusMapView, geographyDotRadius, WORLD_VIEW, zoomMapView } from '../lib/geography-map-transform.ts';

void test('country marker area remains proportional enough to distinguish large catalogs', () => {
  const unitedStates = geographyDotRadius(4427, 4427);
  const canada = geographyDotRadius(244, 4427);
  assert.ok(unitedStates > canada * 2, `expected US radius ${unitedStates} to materially exceed Canada ${canada}`);
  assert.ok(Math.PI * unitedStates ** 2 > Math.PI * canada ** 2 * 4);
});

void test('marker radius is screen-stable while the map zooms', () => {
  assert.equal(geographyDotRadius(100, 100, 4) * 4, geographyDotRadius(100, 100, 1));
});

void test('country focus frames children and clamps zoom', () => {
  const view = focusMapView([{ x: 100, y: 200 }, { x: 300, y: 260 }], { x: 0, y: 0 });
  assert.deepEqual({ centerX: view.centerX, centerY: view.centerY }, { centerX: 200, centerY: 230 });
  assert.ok(view.scale >= 1.8 && view.scale <= 7);
});

void test('zoom controls preserve center and clamp to world/deep limits', () => {
  assert.deepEqual(zoomMapView(WORLD_VIEW, 0.01), WORLD_VIEW);
  assert.deepEqual(zoomMapView({ centerX: 25, centerY: 40, scale: 7 }, 2), { centerX: 25, centerY: 40, scale: 8 });
});
