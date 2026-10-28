import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('data/dataset-manifest.json', root), 'utf8'));

await test('dataset manifest locks the four coverage denominators', () => {
  assert.equal(manifest.coverage.playlistPositions, 7733);
  assert.equal(manifest.coverage.availableTracks, 7582);
  assert.equal(manifest.coverage.genrePlacements, 7582);
  assert.equal(manifest.coverage.timelinePlacements, 7582);
  assert.equal(manifest.coverage.mapPlacements, 7582);
  assert.equal(manifest.coverage.otherTracks, 0);
});

await test('dataset manifest hashes match every declared artifact', () => {
  for (const artifact of manifest.artifacts) {
    const bytes = fs.readFileSync(new URL(artifact.path, root));
    assert.equal(bytes.length, artifact.bytes, `${artifact.path} byte count changed`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), artifact.sha256, `${artifact.path} hash changed`);
  }
});

await test('public and source manifests are identical', () => {
  assert.deepEqual(
    JSON.parse(fs.readFileSync(new URL('public/dataset-manifest.json', root), 'utf8')),
    manifest,
  );
});
