import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const root = process.cwd();
const inputPath = path.join(root, 'data', 'songs-for-self.enriched.csv');
const auditPath = path.join(root, 'data', 'other-genre-audit.csv');
const summaryPath = path.join(root, 'data', 'other-genre-summary.json');
const decisionQueuePath = path.join(root, 'data', 'genre-decision-queue.json');
const rows = parse(fs.readFileSync(inputPath, 'utf8'), { columns: true, skip_empty_lines: true });
const otherRows = rows.filter((row) => row.spotify_track_id && row.genre_family === 'Other');
const decisionQueue = JSON.parse(fs.readFileSync(decisionQueuePath, 'utf8'));
const queuedArtists = new Set(Object.keys(decisionQueue.artists));
const auditColumns = ['playlist_index', 'spotify_track_id', 'track_name', 'artist_names', 'album_name', 'release_year', 'origin_country', 'genre_primary', 'genre_secondary', 'genre_source', 'genre_evidence', 'genre_confidence'];
const artists = new Map();

for (const row of otherRows) {
  for (const artist of row.artist_names.split(';').map((value) => value.trim()).filter(Boolean)) {
    const entry = artists.get(artist) ?? { artist, count: 0, primaryEvidence: new Set(), secondaryEvidence: new Set(), sampleTracks: [] };
    entry.count += 1;
    if (row.genre_primary && row.genre_primary !== 'other / insufficient evidence') entry.primaryEvidence.add(row.genre_primary);
    if (row.genre_secondary) entry.secondaryEvidence.add(row.genre_secondary);
    if (entry.sampleTracks.length < 5 && !entry.sampleTracks.includes(row.track_name)) entry.sampleTracks.push(row.track_name);
    artists.set(artist, entry);
  }
}

fs.writeFileSync(auditPath, stringify(otherRows.map((row) => Object.fromEntries(auditColumns.map((column) => [column, row[column] ?? '']))), { header: true, columns: auditColumns }));
const queuedRows = otherRows.filter((row) => row.artist_names.split(';').map((value) => value.trim()).some((artist) => queuedArtists.has(artist)));
const queuedCounts = new Map();
for (const row of queuedRows) {
  for (const artist of row.artist_names.split(';').map((value) => value.trim()).filter((artist) => queuedArtists.has(artist))) {
    queuedCounts.set(artist, (queuedCounts.get(artist) ?? 0) + 1);
  }
}

fs.writeFileSync(summaryPath, `${JSON.stringify({
  otherTracks: otherRows.length,
  artists: artists.size,
  decisionQueue: {
    tracks: queuedRows.length,
    artists: [...queuedArtists].map((artist) => ({
      artist,
      count: queuedCounts.get(artist) ?? 0,
      ...decisionQueue.artists[artist],
    })).sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist)),
  },
  readyForGenreReviewTracks: otherRows.length - queuedRows.length,
  rankedArtists: [...artists.values()]
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist))
    .map((entry) => ({
      artist: entry.artist,
      count: entry.count,
      primaryEvidence: [...entry.primaryEvidence].sort((left, right) => left.localeCompare(right)),
      secondaryEvidence: [...entry.secondaryEvidence].sort((left, right) => left.localeCompare(right)),
      sampleTracks: entry.sampleTracks,
    })),
}, null, 2)}\n`);

console.log(JSON.stringify({
  auditPath,
  summaryPath,
  otherTracks: otherRows.length,
  artists: artists.size,
  decisionQueueTracks: queuedRows.length,
  readyForGenreReviewTracks: otherRows.length - queuedRows.length,
}, null, 2));
