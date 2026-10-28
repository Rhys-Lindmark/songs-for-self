import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const active = rows.filter((row) => row.spotify_track_id);
const unresolved = active.filter((row) => row.genre_family === 'Other');
const unresolvedArtistCounts = new Map();

for (const row of unresolved) {
  for (const artist of artistsFor(row)) unresolvedArtistCounts.set(artist, (unresolvedArtistCounts.get(artist) ?? 0) + 1);
}

const stable = active.filter((row) => row.genre_family !== 'Other');
const stableByArtist = groupStableFamilies(stable, (row) => artistsFor(row));
const stableByAlbum = groupStableFamilies(stable, (row) => row.spotify_album_id ? [row.spotify_album_id] : []);
const singletonRows = unresolved.filter((row) => artistsFor(row).every((artist) => unresolvedArtistCounts.get(artist) === 1));

const queue = singletonRows.map((row) => {
  const albumSignal = summarizeSignal(stableByAlbum.get(row.spotify_album_id));
  const artistSignals = artistsFor(row)
    .map((artist) => ({ artist, ...summarizeSignal(stableByArtist.get(artist)) }))
    .filter((signal) => signal.support > 0)
    .sort(compareSignals);
  const best = albumSignal.support > 0
    ? { scope: 'album', ...albumSignal }
    : artistSignals[0]
      ? { scope: `artist:${artistSignals[0].artist}`, ...artistSignals[0] }
      : null;
  const candidateFamily = best && best.share >= 0.6 ? best.family : null;
  const candidateConfidence = candidateFamily && candidateFamily !== 'World' && best.support >= 3 && best.share >= 0.8
    ? 'medium'
    : candidateFamily
      ? 'low'
      : 'unresolved';
  return {
    rank: 0,
    track: row.track_name,
    artists: displayArtists(row),
    album: row.album_name,
    spotifyTrackId: row.spotify_track_id,
    spotifyAlbumId: row.spotify_album_id,
    candidateFamily,
    candidateConfidence,
    candidateSignal: best ? {
      scope: best.scope,
      support: best.support,
      share: Number(best.share.toFixed(3)),
      familyCounts: best.familyCounts,
    } : null,
    evidenceGap: candidateFamily === 'World'
      ? 'Related catalog suggests World, but positive regional, traditional, or editorial evidence is required; geography alone cannot support placement.'
      : candidateFamily
        ? 'Related playlist catalog suggests a family, but exact track, release, or official artist evidence is still required before placement.'
        : best
          ? 'Related playlist catalog conflicts across families; research the exact track or release instead of selecting the plurality.'
          : 'No classifiable source or related stable playlist catalog remains; research the exact track, release, label, or official artist description.',
    currentSource: row.genre_source,
    currentEvidence: row.genre_evidence,
  };
}).sort((left, right) => {
  const confidenceOrder = { medium: 0, low: 1, unresolved: 2 };
  return confidenceOrder[left.candidateConfidence] - confidenceOrder[right.candidateConfidence]
    || (right.candidateSignal?.support ?? 0) - (left.candidateSignal?.support ?? 0)
    || left.artists[0].localeCompare(right.artists[0])
    || left.track.localeCompare(right.track);
}).map((item, index) => ({ ...item, rank: index + 1 }));

const output = {
  generatedFromMaxEnrichedAt: active.map((row) => row.enriched_at).filter(Boolean).sort((left, right) => left.localeCompare(right)).at(-1) ?? null,
  method: 'Review queue only. Candidate families come solely from already classified rows sharing the exact album or credited artist. They are not applied to the dataset and require exact evidence.',
  unresolvedTracks: unresolved.length,
  strictSingletonTracks: singletonRows.length,
  candidateCounts: queue.reduce((counts, item) => {
    counts[item.candidateConfidence] = (counts[item.candidateConfidence] ?? 0) + 1;
    return counts;
  }, {}),
  queue,
};

const outputPath = path.join(root, 'data', 'genre-singleton-review-queue.json');
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, unresolvedTracks: output.unresolvedTracks, strictSingletonTracks: output.strictSingletonTracks, candidateCounts: output.candidateCounts }, null, 2));

function artistsFor(row) {
  return row.artist_names.split(';').map((value) => normalize(value)).filter(Boolean);
}

function displayArtists(row) {
  const artists = row.artist_names.split(';').map((value) => value.trim()).filter(Boolean);
  return artists.length ? artists : ['Unknown artist'];
}

function normalize(value) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, ' ').trim();
}

function groupStableFamilies(sourceRows, keysFor) {
  const groups = new Map();
  for (const row of sourceRows) {
    for (const key of keysFor(row)) {
      if (!key) continue;
      const familyCounts = groups.get(key) ?? new Map();
      familyCounts.set(row.genre_family, (familyCounts.get(row.genre_family) ?? 0) + 1);
      groups.set(key, familyCounts);
    }
  }
  return groups;
}

function summarizeSignal(familyCounts = new Map()) {
  const ranked = [...familyCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const support = ranked.reduce((sum, [, count]) => sum + count, 0);
  return {
    family: ranked[0]?.[0] ?? null,
    support,
    share: support ? ranked[0][1] / support : 0,
    familyCounts: Object.fromEntries(ranked),
  };
}

function compareSignals(left, right) {
  return right.support - left.support || right.share - left.share || left.artist.localeCompare(right.artist);
}
