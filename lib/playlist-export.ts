import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
import type { VisitorGenrePlacement } from '@/lib/visitor-genre-space';

const headers = ['spotify_track_id', 'track', 'artist', 'timeline_year', 'timeline_source', 'timeline_confidence', 'genre_family', 'genre_source', 'genre_confidence', 'origin_city', 'origin_country', 'map_x', 'map_y', 'geography_source', 'geography_confidence', 'genre_space_family', 'genre_space_detail', 'genre_space_x', 'genre_space_y', 'genre_space_method', 'genre_space_confidence', 'genre_space_source', 'every_noise_reference_genres', 'overall_method'];

export function serializeEnrichedPlaylist(tracks: AnalyzedTrack[], placements: VisitorGenrePlacement[]) {
  const byIndex = new Map(placements.map((placement) => [placement.index, placement]));
  const records = tracks.map((track, index) => {
    const space = byIndex.get(index);
    return [track.spotifyTrackId, track.track, track.artist, track.year, track.timeSource, track.timeConfidence, track.genre, track.genreSource, track.genreConfidence, track.city, track.country, track.x, track.y, track.geographySource, track.geographyConfidence, space?.family ?? 'Other', space?.primary ?? 'Unresolved', space?.x, space?.y, space?.method ?? 'unresolved', space?.confidence ?? 'unresolved', space?.source ?? 'No genre-space placement', space?.referenceGenres.join('; ') ?? '', track.method];
  });
  return `${[headers, ...records].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

export function enrichedPlaylistFileName(inputName: string) {
  const stem = inputName.replace(/\.csv$/i, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'playlist';
  return `${stem}-songs-for-self-enriched.csv`;
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
