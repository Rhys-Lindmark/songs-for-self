import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const payload = JSON.parse(fs.readFileSync(new URL('../public/genre-space-data.json', import.meta.url), 'utf8'));
const byId = new Map(payload.points.map((point) => [point.id, point]));

const fixtures = [
  ['0BjhFPHZw3n3GtuMmaBr4p', 'Classical', 'baroque'],
  ['7GPkaA7ZYLKOsZylGPoxDQ', 'Experimental', 'experimental rock'],
  ['5UWYJWoVXRpaLuzzXmHqg8', 'Country', 'country'],
  ['0oks4FnzhNp5QPTZtoet7c', 'Electronic', 'house'],
  ['7shVwhUdVbHpykOfbzvDc1', 'Modern Folk', 'folk'],
  ['5oJ6pSfpV5HH9QBeXyNMjJ', 'Hip-hop', 'alternative hip hop'],
  ['0n8sBhOtUb6pDFKjpxfakj', 'Jazz', 'jazz'],
  ['0D4gIeyrMtxOAvCWsTHN9x', 'Pop', 'chanson'],
  ['0ipquVHjTKsL5vFd1WZkoO', 'R&B, Soul & Blues', 'soul'],
  ['4toSP60xmDNCFuXly8ywNZ', 'Rock', 'alternative rock'],
  ['2SGfKTYnLLX1UCEA84O6IZ', 'World', 'afrobeat'],
  ['4Uhu3px9duL1e7Xzcnepdk', 'Traditional Folk', 'traditional folk'],
];

await test('held-out recognizable recordings cover all twelve requested families', () => {
  assert.equal(new Set(fixtures.map(([, family]) => family)).size, 12);
  for (const [id, family, genre] of fixtures) {
    const point = byId.get(id);
    assert.ok(point, `missing held-out track ${id}`);
    assert.equal(point.family, family, `${point.title} moved out of ${family}`);
    assert.ok(point.referenceGenres.includes(genre), `${point.title} lost ${genre} reference evidence`);
    assert.ok(point.referenceSource.length > 0 && Number.isFinite(point.referenceX) && Number.isFinite(point.referenceY));
  }
});

await test('recognizable same-neighborhood pairs remain closer than cross-family controls', () => {
  const bach = byId.get('0BjhFPHZw3n3GtuMmaBr4p');
  const beethoven = byId.get('0rmJrfdzblfhgNQuwIFnLo');
  const miles = byId.get('0n8sBhOtUb6pDFKjpxfakj');
  const coltrane = byId.get('5WDDO4MWcgFHTe2Ufo5r6o');
  const rocky = byId.get('5oJ6pSfpV5HH9QBeXyNMjJ');
  assert.ok(distance(bach, beethoven) < 0.08, 'Bach and Beethoven should remain in the broad classical neighborhood');
  assert.ok(distance(miles, coltrane) < 0.04, 'Miles Davis and John Coltrane should remain close in jazz space');
  assert.ok(distance(bach, rocky) > 0.5, 'classical and alternative hip-hop controls should remain meaningfully separated');
});

function distance(left, right) {
  return Math.hypot(left.referenceX - right.referenceX, left.referenceY - right.referenceY);
}
