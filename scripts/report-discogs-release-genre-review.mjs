import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { classifyRankedGenres } from './music-taxonomy.mjs';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'discogs-release-genre-cache.json'), 'utf8'));
const decisions = JSON.parse(fs.readFileSync(path.join(root, 'data', 'discogs-release-genre-decisions.json'), 'utf8'));
const report = Object.values(cache.albums ?? {}).filter((entry) => entry.matched).map((entry) => {
  const classification = classifyRankedGenres([
    ...entry.genres.filter(isSpecificDiscogsGenre).map((name) => ({ name, count: 1, kind: 'genre' })),
    ...entry.styles.map((name) => ({ name, count: 1, kind: 'genre' })),
  ]);
  const matchingRows = rows.filter((row) => row.spotify_album_id === entry.spotifyAlbumId);
  const decision = decisions.albums?.[entry.spotifyAlbumId];
  return {
    track_count: matchingRows.length,
    artist: entry.artistName,
    album: entry.albumName,
    matched_release: entry.matchedTitle,
    match_method: entry.matchMethod || 'fielded-query',
    review_decision: decision?.action || '',
    resulting_family: decision?.action === 'override' ? decision.family : decision?.action === 'reject' ? 'Other' : classification.family,
    review_reason: decision?.rationale || '',
    genres: entry.genres.join('; '),
    styles: entry.styles.join('; '),
    title_similarity: entry.titleSimilarity,
    artist_similarity: entry.artistSimilarity,
    discogs_release_id: entry.discogsReleaseId,
    source_url: entry.sourceUrl,
    playlist_examples: matchingRows.slice(0, 4).map((row) => row.track_name).join(' | '),
  };
}).sort((left, right) => right.track_count - left.track_count || left.artist.localeCompare(right.artist) || left.album.localeCompare(right.album));

const reportPath = path.join(root, 'data', 'discogs-release-genre-review.csv');
fs.writeFileSync(reportPath, stringify(report, { header: true }));
console.log(JSON.stringify({ rows: report.length, classifiable: report.filter((row) => row.resulting_family !== 'Other').length, reportPath }, null, 2));

function isSpecificDiscogsGenre(name) {
  return !/^folk,?\s*world,?\s*(?:&|and)\s*country$/i.test(String(name).trim());
}
