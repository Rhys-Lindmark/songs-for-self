import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const root = path.resolve(process.cwd());
const spotify = await loadTs(path.join(root, 'lib', 'spotify-import.ts'));
const analyzer = await loadTs(path.join(root, 'lib', 'playlist-analyzer.ts'));
const canonical = analyzer.parseCsv(fs.readFileSync(path.join(root, 'public', 'songs-for-self-v3.csv'), 'utf8'));
const lookupText = fs.readFileSync(path.join(root, 'public', 'upload-lookup.json'), 'utf8');
const warmLookup = JSON.parse(lookupText);
const sizes = [100, 150, 200, 250, 300, 400, 500, 600, 750, 1000];
const scenarios = [];

for (const [index, size] of sizes.entries()) {
  const start = Math.floor((canonical.length - size) * (index / Math.max(1, sizes.length - 1)));
  const sourceRows = canonical.slice(start, start + size);
  const pages = chunk(sourceRows.map(toSpotifyItem), 50);
  let transferredBytes = 0;
  const paginationStarted = performance.now();
  const imported = await spotify.fetchSpotifyPlaylistRows({
    playlistId: '3QNxR8qUDQd8e5KyNsOZgx', accessToken: 'benchmark-token',
    fetcher: async (url) => {
      const offset = Number(new URL(url).searchParams.get('offset') || 0);
      const items = pages[Math.floor(offset / 50)] ?? [];
      const payload = { total: sourceRows.length, offset, limit: 50, next: offset + items.length < sourceRows.length ? `page-${offset + items.length}` : null, items };
      const body = JSON.stringify(payload);
      transferredBytes += Buffer.byteLength(body);
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const paginationMs = performance.now() - paginationStarted;
  const coldStarted = performance.now();
  const coldLookup = JSON.parse(lookupText);
  const coldLookupParseMs = performance.now() - coldStarted;
  const analysisStarted = performance.now();
  const analyzed = analyzer.analyzePlaylistRows(imported.rows, warmLookup);
  const analysisMs = performance.now() - analysisStarted;
  const coldAnalysisStarted = performance.now();
  analyzer.analyzePlaylistRows(imported.rows, coldLookup);
  const coldAnalysisMs = performance.now() - coldAnalysisStarted;
  scenarios.push({
    label: `canonical-${size}`,
    requestedPositions: size,
    importedTracks: imported.rows.length,
    skippedPositions: imported.skipped,
    requests: imported.requests,
    estimatedApiPayloadBytes: transferredBytes,
    paginationMs: round(paginationMs),
    warmAnalysisMs: round(analysisMs),
    coldLookupParseMs: round(coldLookupParseMs),
    coldAnalysisMs: round(coldAnalysisMs),
    exactMatches: analyzed.filter((track) => track.method === 'exact track').length,
    genrePlacements: analyzed.filter((track) => track.genre !== 'Other').length,
    timePlacements: analyzed.filter((track) => track.year !== null).length,
    mapPlacements: analyzed.filter((track) => track.x !== null && track.y !== null).length,
  });
}

const paginationSimulation = await comparePaginationLatency(canonical.slice(0, 1000), 20);

const output = {
  version: 2,
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  fixtureKind: 'ten deterministic Songs for Self canonical slices',
  scope: 'local pagination-shape, lookup parse, and enrichment compute only; network and Spotify authorization latency excluded',
  policyNote: 'Real-playlist benchmarking remains limited to consented playlists owned by or collaborative with an allowlisted Spotify user.',
  lookupBytes: Buffer.byteLength(lookupText),
  paginationSimulation,
  scenarios,
};
const outputPath = path.join(root, 'data', 'playlist-import-benchmark.json');
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));

async function loadTs(filePath) {
  const compiled = ts.transpile(fs.readFileSync(filePath, 'utf8'), { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function toSpotifyItem(row) {
  const artists = String(row.artist_names || '').split(';').map((name, index) => ({ id: String(row.spotify_artist_ids || '').split(';')[index] || null, name: name.trim() })).filter((artist) => artist.name);
  return { item: { id: row.spotify_track_id, name: row.track_name, type: 'track', uri: `spotify:track:${row.spotify_track_id}`, artists, album: { id: row.spotify_album_id, name: row.album_name, release_date: row.release_date } } };
}

function round(value) { return Math.round(value * 100) / 100; }

async function comparePaginationLatency(sourceRows, pageLatencyMs) {
  const pages = chunk(sourceRows.map(toSpotifyItem), 50);
  async function measure(paginationConcurrency) {
    const started = performance.now();
    await spotify.fetchSpotifyPlaylistRows({
      playlistId: '3QNxR8qUDQd8e5KyNsOZgx', accessToken: 'benchmark-token', paginationConcurrency,
      fetcher: async (url) => {
        const offset = Number(new URL(url).searchParams.get('offset') || 0);
        await new Promise((resolve) => setTimeout(resolve, pageLatencyMs));
        const items = pages[Math.floor(offset / 50)] ?? [];
        return new Response(JSON.stringify({ total: sourceRows.length, offset, limit: 50, next: offset + items.length < sourceRows.length ? `page-${offset + items.length}` : null, items }), { status: 200 });
      },
    });
    return round(performance.now() - started);
  }
  const sequentialMs = await measure(1);
  const boundedParallelMs = await measure(3);
  return {
    positions: sourceRows.length,
    pageSize: 50,
    syntheticPageLatencyMs: pageLatencyMs,
    sequentialMs,
    boundedParallelMs,
    measuredSpeedup: round(sequentialMs / boundedParallelMs),
    note: 'Synthetic fixed-latency comparison only; it is not a Spotify production-network measurement.',
  };
}
