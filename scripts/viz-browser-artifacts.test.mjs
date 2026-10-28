import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const canonical = JSON.parse(fs.readFileSync(new URL('data/viz-data.json', root), 'utf8'));
const summary = JSON.parse(fs.readFileSync(new URL('data/viz-summary.json', root), 'utf8'));
const timeline = JSON.parse(fs.readFileSync(new URL('public/timeline-data.json', root), 'utf8'));
const geography = JSON.parse(fs.readFileSync(new URL('public/geography-data.json', root), 'utf8'));
const outline = JSON.parse(fs.readFileSync(new URL('public/world-outline.json', root), 'utf8'));
const uploadLookupText = fs.readFileSync(new URL('public/upload-lookup.json', root), 'utf8');
const uploadLookup = JSON.parse(uploadLookupText);

await test('browser visualization artifacts exactly preserve canonical data', () => {
  assert.deepEqual(summary, canonical.summary);
  assert.deepEqual(timeline.timeline, canonical.timeline);
  assert.deepEqual(timeline.historicalPeriods, canonical.historicalPeriods);
  assert.deepEqual(geography.countries, canonical.geography.countries);
  assert.equal(geography.placeCount, canonical.places.length);
  assert.equal(geography.worldPath, canonical.worldPath);
  assert.equal(outline.worldPath, canonical.worldPath);
});

await test('the private upload path can fetch only the map outline', () => {
  const outlineBytes = fs.statSync(new URL('public/world-outline.json', root)).size;
  const geographyBytes = fs.statSync(new URL('public/geography-data.json', root)).size;
  assert.ok(outlineBytes < geographyBytes / 4, `${outlineBytes} should be less than one quarter of ${geographyBytes}`);
});

await test('browser-local enrichment retains field provenance within its transfer budget', () => {
  assert.equal(uploadLookup.tracks.length, 7582);
  assert.ok(uploadLookup.tracks.every((track) => track.genreSource && track.genreConfidence && track.timeSource && track.timeConfidence && track.geographySource && track.geographyConfidence));
  assert.ok(Buffer.byteLength(uploadLookupText) < 6_000_000);
  assert.ok(gzipSync(uploadLookupText).byteLength < 1_000_000);
});
