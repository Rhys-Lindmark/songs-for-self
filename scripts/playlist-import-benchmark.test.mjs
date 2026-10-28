import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const benchmark = JSON.parse(fs.readFileSync(new URL('../data/playlist-import-benchmark.json', import.meta.url), 'utf8'));

test('playlist import benchmark covers ten bounded consent-safe scenarios', () => {
  assert.equal(benchmark.scenarios.length, 10);
  assert.match(benchmark.fixtureKind, /canonical slices/);
  assert.match(benchmark.scope, /network.*excluded/);
  assert.match(benchmark.policyNote, /owned by or collaborative/);
  for (const scenario of benchmark.scenarios) {
    assert.ok(scenario.requestedPositions >= 100 && scenario.requestedPositions <= 1000);
    assert.equal(scenario.importedTracks + scenario.skippedPositions, scenario.requestedPositions);
    assert.equal(scenario.genrePlacements, scenario.importedTracks);
    assert.equal(scenario.timePlacements, scenario.importedTracks);
    assert.equal(scenario.mapPlacements, scenario.importedTracks);
    assert.ok(scenario.requests <= Math.ceil(scenario.requestedPositions / 50));
  }
});

test('one-thousand-position compute stays comfortably below interactive budgets', () => {
  const largest = benchmark.scenarios.at(-1);
  assert.equal(largest.requestedPositions, 1000);
  assert.ok(largest.warmAnalysisMs < 100);
  assert.ok(largest.coldLookupParseMs + largest.coldAnalysisMs < 250);
});

test('bounded pagination overlap reduces the checked-in synthetic wait model', () => {
  const simulation = benchmark.paginationSimulation;
  assert.equal(simulation.positions, 1000);
  assert.equal(simulation.pageSize, 50);
  assert.match(simulation.note, /Synthetic.*not a Spotify production-network measurement/i);
  assert.ok(simulation.boundedParallelMs < simulation.sequentialMs);
  assert.ok(simulation.measuredSpeedup > 2);
});
