import type { GenreSpacePayload, GenreSpacePoint } from '@/components/genre-space-map';
import type { AnalyzedTrack } from '@/lib/playlist-analyzer';

export type VisitorGenreSpaceResult = {
  payload: GenreSpacePayload;
  exactTracks: number;
  artistCentroids: number;
  familyFallbacks: number;
  unresolved: AnalyzedTrack[];
  placements: VisitorGenrePlacement[];
};

export type VisitorGenrePlacement = { index: number; family: string; primary: string; x: number | null; y: number | null; method: string; confidence: string; source: string; referenceGenres: string[] };

export function buildVisitorGenreSpace(tracks: AnalyzedTrack[], atlas: GenreSpacePayload): VisitorGenreSpaceResult {
  const pointsById = new Map(atlas.points.map((point) => [point.id, point]));
  const pointsByKey = new Map(atlas.points.map((point) => [trackKey(point.title, point.artists), point]));
  const artistsByName = new Map(atlas.artists.map((artist) => [normalize(artist.label), artist]));
  const familiesByName = new Map(atlas.families.map((family) => [family.family, family]));
  const representativeByArtist = new Map<string, GenreSpacePoint>();
  for (const point of atlas.points) for (const name of point.artists.split(/[;,]/)) {
    const key = normalize(name);
    if (key && !representativeByArtist.has(key)) representativeByArtist.set(key, point);
  }
  const visitorPoints: GenreSpacePoint[] = [];
  const unresolved: AnalyzedTrack[] = [];
  const placements: VisitorGenrePlacement[] = [];
  let exactTracks = 0;
  let artistCentroids = 0;
  let familyFallbacks = 0;

  tracks.forEach((track, index) => {
    const exact = (track.spotifyTrackId ? pointsById.get(track.spotifyTrackId) : undefined) ?? pointsByKey.get(trackKey(track.track, track.artist));
    const visitorId = `visitor-${index}-${stableHash(`${track.track}|${track.artist}`)}`;
    if (exact) {
      exactTracks += 1;
      visitorPoints.push({ ...exact, ...(track.album ? { album: track.album } : {}), ...(track.spotifyAlbumId ? { spotifyAlbumId: track.spotifyAlbumId } : {}), ...(track.coverUrl ? { coverUrl: track.coverUrl } : {}), id: visitorId, spotifyTrackId: exact.id, method: `visitor exact match · ${exact.method}` });
      placements.push({ index, family: exact.family, primary: exact.primary, x: exact.referenceX ?? exact.x, y: exact.referenceY ?? exact.y, method: `visitor exact match · ${exact.method}`, confidence: exact.confidence, source: exact.source, referenceGenres: exact.referenceGenres ?? [] });
      return;
    }

    const primaryArtist = String(track.artist).split(/[;,]/)[0];
    const artist = artistsByName.get(normalize(primaryArtist));
    if (artist) {
      const representative = representativeByArtist.get(normalize(primaryArtist));
      const jitter = deterministicJitter(visitorId, 0.012);
      artistCentroids += 1;
      visitorPoints.push({
        id: visitorId,
        spotifyTrackId: track.spotifyTrackId,
        title: track.track,
        artists: track.artist,
        spotifyArtistIds: artist.spotifyArtistId ? [artist.spotifyArtistId] : [],
        album: track.album || '',
        spotifyAlbumId: track.spotifyAlbumId || null,
        ...(track.coverUrl ? { coverUrl: track.coverUrl } : {}),
        family: artist.family,
        primary: representative?.primary ?? `${artist.family} artist neighborhood`,
        secondary: representative?.secondary ?? '',
        x: clamp(artist.x + jitter.x),
        y: clamp(artist.y + jitter.y),
        confidence: 'medium',
        source: `Songs for Self artist centroid · ${artist.label}`,
        method: 'visitor artist-centroid inference',
        estimated: true,
      });
      placements.push({ index, family: artist.family, primary: representative?.primary ?? `${artist.family} artist neighborhood`, x: artist.x, y: artist.y, method: 'visitor artist-centroid inference', confidence: 'medium', source: `Songs for Self artist centroid · ${artist.label}`, referenceGenres: representative?.referenceGenres ?? [] });
      return;
    }

    if (track.genreSpaceX !== null && track.genreSpaceX !== undefined && track.genreSpaceY !== null && track.genreSpaceY !== undefined) {
      const jitter = deterministicJitter(visitorId, 0.012);
      artistCentroids += 1;
      visitorPoints.push({
        id: visitorId,
        spotifyTrackId: track.spotifyTrackId,
        title: track.track,
        artists: track.artist,
        spotifyArtistIds: [],
        album: track.album || '',
        spotifyAlbumId: track.spotifyAlbumId || null,
        ...(track.coverUrl ? { coverUrl: track.coverUrl } : {}),
        family: track.genre,
        primary: track.genreSpacePrimary || `${track.genre} artist neighborhood`,
        secondary: (track.genreSpaceGenres ?? []).filter((genre) => genre !== track.genreSpacePrimary).slice(0, 3).join('; '),
        x: clamp(track.genreSpaceX + jitter.x),
        y: clamp(track.genreSpaceY + jitter.y),
        confidence: 'medium',
        source: track.genreSource,
        method: 'visitor sourced artist-genre centroid',
        estimated: true,
      });
      placements.push({ index, family: track.genre, primary: track.genreSpacePrimary || `${track.genre} artist neighborhood`, x: track.genreSpaceX, y: track.genreSpaceY, method: 'visitor sourced artist-genre centroid', confidence: 'medium', source: track.genreSource, referenceGenres: track.genreSpaceGenres ?? [] });
      return;
    }

    const family = familiesByName.get(track.genre);
    if (family) {
      const jitter = deterministicJitter(visitorId, 0.035);
      familyFallbacks += 1;
      visitorPoints.push({
        id: visitorId,
        spotifyTrackId: track.spotifyTrackId,
        title: track.track,
        artists: track.artist,
        spotifyArtistIds: [],
        album: track.album || '',
        spotifyAlbumId: track.spotifyAlbumId || null,
        ...(track.coverUrl ? { coverUrl: track.coverUrl } : {}),
        family: family.family,
        primary: `${family.family} · uploaded genre fallback`,
        secondary: '',
        x: clamp(family.x + jitter.x),
        y: clamp(family.y + jitter.y),
        confidence: 'low',
        source: 'Visitor-supplied genre mapped to the playlist-weighted centroid of Every Noise reference genres in this reviewed family',
        method: 'visitor family-centroid fallback',
        estimated: true,
      });
      placements.push({ index, family: family.family, primary: `${family.family} · uploaded genre fallback`, x: family.x, y: family.y, method: 'visitor family-centroid fallback', confidence: 'low', source: 'Visitor-supplied genre mapped to the playlist-weighted centroid of Every Noise reference genres in this reviewed family', referenceGenres: [] });
      return;
    }

    unresolved.push(track);
    placements.push({ index, family: 'Other', primary: 'Unresolved', x: null, y: null, method: 'unresolved', confidence: 'unresolved', source: 'No exact track, known artist centroid, or usable supplied genre', referenceGenres: [] });
  });

  const families = atlas.families.map((family) => ({ ...family, count: visitorPoints.filter((point) => point.family === family.family).length })).filter((family) => family.count > 0);
  const clusters = aggregateCentroids(visitorPoints, (point) => `${point.family}|${point.primary}`, (point) => point.primary).map(({ key, label, ...cluster }) => ({ id: `visitor-cluster-${stableHash(key)}`, label, ...cluster }));
  const artists = aggregateCentroids(visitorPoints, (point) => `${point.family}|${normalize(point.artists.split(/[;,]/)[0])}`, (point) => point.artists.split(/[;,]/)[0].trim()).map(({ key, label, ...artist }) => ({ id: `visitor-artist-${stableHash(key)}`, label, spotifyArtistId: null, ...artist }));
  const usedAlbumIds = new Set(visitorPoints.map((point) => point.spotifyAlbumId).filter(Boolean));
  const albums = Object.fromEntries(Object.entries(atlas.albums).filter(([albumId]) => usedAlbumIds.has(albumId)));

  return {
    exactTracks,
    artistCentroids,
    familyFallbacks,
    unresolved,
    placements: placements.sort((left, right) => left.index - right.index),
    payload: {
      projection: {
        ...atlas.projection,
        name: `${atlas.projection.name} · visitor playlist`,
        method: `${atlas.projection.method} Visitor rows reuse exact points, artist centroids, or visibly labeled family-centroid fallbacks.`,
      },
      summary: {
        tracks: visitorPoints.length,
        families: families.length,
        clusters: clusters.length,
        artists: artists.length,
        albumCovers: Object.keys(albums).length,
        referenceGenres: atlas.summary.referenceGenres,
        exactReferenceTracks: exactTracks + artistCentroids,
        familyReferenceFallbackTracks: familyFallbacks,
      },
      families,
      clusters,
      artists,
      albums,
      points: visitorPoints,
    },
  };
}

function aggregateCentroids(points: GenreSpacePoint[], keyFor: (point: GenreSpacePoint) => string, labelFor: (point: GenreSpacePoint) => string) {
  const groups = new Map<string, GenreSpacePoint[]>();
  for (const point of points) {
    const key = keyFor(point);
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, members]) => ({
    key,
    family: members[0].family,
    label: labelFor(members[0]) || members[0].family,
    count: members.length,
    x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
    y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
  }));
}

function deterministicJitter(key: string, radius: number) {
  const hash = stableHash(key);
  const angle = (hash % 3600) / 3600 * Math.PI * 2;
  const distance = ((Math.floor(hash / 3600) % 1000) / 1000) * radius;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(value: string) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function trackKey(track: string, artist: string) { return `${normalize(track)}|${normalize(String(artist).split(/[;,]/)[0])}`; }
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
