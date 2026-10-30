import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const readme = read('README.md');
const runbook = read('RUNBOOK.md');
const versioning = read('DATA_VERSIONING.md');
const packageDocument = readJson('package.json');
const manifest = readJson('data/dataset-manifest.json');

await test('README routes operators to every persistent project contract', () => {
  for (const path of ['AGENTS.md', 'RUNBOOK.md', 'SPOTIFY_IMPORT.md', 'DATA_VERSIONING.md', 'RESPONSIVE_TESTING.md']) {
    assert.ok(readme.includes(`(${path})`), `README is missing ${path}`);
    assert.ok(fs.existsSync(new URL(path, root)), `${path} does not exist`);
  }
});

await test('every documented npm data command exists', () => {
  const commands = [...runbook.matchAll(/npm run (data:[a-z0-9:-]+)/g)].map((match) => match[1]);
  assert.ok(commands.length > 0);
  for (const command of new Set(commands)) assert.ok(packageDocument.scripts[command], `${command} is not defined`);
});

await test('runbook and migration notes name the current published data contract', () => {
  assert.ok(runbook.includes('availableTracks = genrePlacements = timelinePlacements = mapPlacements = 7,582'));
  assert.ok(versioning.includes(`\`${manifest.datasetVersion}\``));
  for (const artifact of manifest.artifacts) assert.ok(
    runbook.includes(artifact.path) || versioning.includes(artifact.path) || artifact.path === 'data/songs-for-self.enriched.csv',
    `documentation does not mention published artifact ${artifact.path}`,
  );
});
