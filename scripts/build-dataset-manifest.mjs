import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const csvPath = path.join(root, 'data', 'songs-for-self.enriched.csv');
const vizPath = path.join(root, 'data', 'viz-data.json');
const uploadPath = path.join(root, 'public', 'upload-lookup.json');
const summaryPath = path.join(root, 'data', 'viz-summary.json');
const timelinePath = path.join(root, 'public', 'timeline-data.json');
const geographyPath = path.join(root, 'public', 'geography-data.json');
const worldOutlinePath = path.join(root, 'public', 'world-outline.json');
const genreSpacePath = path.join(root, 'public', 'genre-space-data.json');
const everyNoiseReferencePath = path.join(root, 'data', 'every-noise-reference-2023.json');
const everyNoiseArtistMembershipPath = path.join(root, 'data', 'every-noise-artist-memberships.json');
const everyNoiseFamilyReviewPath = path.join(root, 'data', 'every-noise-family-review.csv');
const usStateCoordinateCachePath = path.join(root, 'data', 'us-state-coordinate-cache.json');
const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });
const active = rows.filter((row) => row.spotify_track_id);
const viz = JSON.parse(fs.readFileSync(vizPath, 'utf8'));
const maxEnrichedAt = active.map((row) => row.enriched_at).filter(Boolean).sort((left, right) => left.localeCompare(right)).at(-1) ?? null;
const requestedFamilies = [
  'Classical', 'Experimental', 'Country', 'Electronic', 'Modern Folk', 'Hip-hop', 'Jazz',
  'Pop', 'R&B, Soul & Blues', 'Rock', 'World', 'Traditional Folk', 'Other',
];

const artifacts = [
  ['data/songs-for-self.enriched.csv', csvPath],
  ['data/viz-data.json', vizPath],
  ['data/viz-summary.json', summaryPath],
  ['public/timeline-data.json', timelinePath],
  ['public/geography-data.json', geographyPath],
  ['public/world-outline.json', worldOutlinePath],
  ['public/genre-space-data.json', genreSpacePath],
  ['data/every-noise-reference-2023.json', everyNoiseReferencePath],
  ['data/every-noise-artist-memberships.json', everyNoiseArtistMembershipPath],
  ['data/every-noise-family-review.csv', everyNoiseFamilyReviewPath],
  ['data/us-state-coordinate-cache.json', usStateCoordinateCachePath],
  ['public/upload-lookup.json', uploadPath],
].map(([relativePath, absolutePath]) => {
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
});

const manifest = {
  manifestSchemaVersion: 1,
  datasetVersion: '3.9.25',
  generatedFrom: { maxEnrichedAt },
  coverage: {
    playlistPositions: rows.length,
    availableTracks: active.length,
    genrePlacements: viz.summary.genreTracks,
    timelinePlacements: viz.summary.timelineTracks,
    mapPlacements: viz.summary.mappedTracks,
    otherTracks: viz.summary.genreCounts.Other,
  },
  taxonomy: { source: 'PLAN.md#wikipedia-derived-top-level-taxonomy', families: requestedFamilies },
  artifacts,
};

const output = `${JSON.stringify(manifest, null, 2)}\n`;
fs.writeFileSync(path.join(root, 'data', 'dataset-manifest.json'), output);
fs.writeFileSync(path.join(root, 'public', 'dataset-manifest.json'), output);
console.log(JSON.stringify(manifest, null, 2));
