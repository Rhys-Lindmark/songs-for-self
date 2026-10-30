export type PlacementConfidence = 'high' | 'medium' | 'low' | 'user-supplied' | 'unresolved';
export type LookupTrack = { id: string; key: string; track: string; artist: string; year: number | null; genre: string; x: number | null; y: number | null; city: string; country: string; genreSource?: string; genreConfidence?: PlacementConfidence; timeSource?: string; timeConfidence?: PlacementConfidence; geographySource?: string; geographyConfidence?: PlacementConfidence };
export type LookupArtist = { key: string; name: string; genre: string; year: number | null; x: number | null; y: number | null; city: string; country: string };
export type Lookup = { tracks: LookupTrack[]; artists: LookupArtist[] };
export type GlobalArtistGenre = { id: string; key: string; name: string; family: string; primary: string; genres: string[]; x: number; y: number; method: string; sourceUrl: string };
export type GlobalArtistGenreIndex = { schemaVersion: number; sourceName: string; sourceUrl: string; sourceModel: string; referenceUrl: string; artists: GlobalArtistGenre[] };
export type AnalyzedTrack = { album?: string; spotifyAlbumId?: string | null; coverUrl?: string | null; spotifyTrackId: string | null; track: string; artist: string; year: number | null; genre: string; genreSpaceX?: number | null; genreSpaceY?: number | null; genreSpacePrimary?: string; genreSpaceGenres?: string[]; x: number | null; y: number | null; city: string; country: string; method: 'exact track' | 'artist inference' | 'uploaded metadata' | 'fallback'; genreSource: string; genreConfidence: PlacementConfidence; timeSource: string; timeConfidence: PlacementConfidence; geographySource: string; geographyConfidence: PlacementConfidence };

export function analyzePlaylistRows(rows: Record<string, string>[], lookup: Lookup, globalGenreIndex?: GlobalArtistGenreIndex): AnalyzedTrack[] {
  const byId = new Map(lookup.tracks.map((track) => [track.id, track]));
  const byKey = new Map(lookup.tracks.map((track) => [track.key, track]));
  const byArtist = new Map(lookup.artists.map((artist) => [artist.key, artist]));
  const globalById = new Map((globalGenreIndex?.artists ?? []).map((artist) => [artist.id, artist]));
  const globalNameCounts = new Map<string, number>();
  for (const artist of globalGenreIndex?.artists ?? []) globalNameCounts.set(artist.key, (globalNameCounts.get(artist.key) ?? 0) + 1);
  const globalByName = new Map((globalGenreIndex?.artists ?? []).filter((artist) => globalNameCounts.get(artist.key) === 1).map((artist) => [artist.key, artist]));
  return rows.map((row) => {
    const track = pick(row, ['track name', 'track_name', 'track', 'name', 'title']);
    const artist = pick(row, ['artist name(s)', 'artist name', 'artist_names', 'artist', 'artists']);
    const id = spotifyId(pick(row, ['spotify track id', 'spotify_track_id', 'track id', 'track uri', 'uri']));
    const album = pick(row, ['album name', 'album_name', 'album']);
    const albumId = pick(row, ['album id', 'spotify album id', 'spotify_album_id', 'album uri']).match(/(?:album[:/])?([A-Za-z0-9]{22})$/)?.[1];
    const coverUrl = pick(row, ['image url', 'album image url', 'album cover url', 'cover url', 'cover_url', 'artwork url']);
    const artwork = { ...(album ? { album } : {}), ...(albumId ? { spotifyAlbumId: albumId } : {}), ...(coverUrl ? { coverUrl } : {}) };
    const exact = byId.get(id) ?? byKey.get(trackKey(track, artist));
    if (exact) return {
      ...exact, ...artwork, spotifyTrackId: exact.id, method: 'exact track' as const,
      genreSource: exact.genreSource || 'Songs for Self exact-track enrichment', genreConfidence: exact.genreConfidence || 'medium',
      timeSource: exact.timeSource || 'Songs for Self exact-track enrichment', timeConfidence: exact.timeConfidence || 'medium',
      geographySource: exact.geographySource || 'Songs for Self exact-track enrichment', geographyConfidence: exact.geographyConfidence || 'medium',
    };
    const knownArtist = byArtist.get(normalize(String(artist).split(/[;,]/)[0]));
    const spotifyArtistIds = pick(row, ['artist ids', 'artist id', 'spotify artist ids', 'spotify_artist_ids']).split(/[;,]/).map((value) => value.trim()).filter(Boolean);
    const globalArtist = spotifyArtistIds.map((artistId) => globalById.get(artistId)).find(Boolean) ?? globalByName.get(normalize(String(artist).split(/[;,]/)[0]));
    const suppliedYear = parseYear(pick(row, ['release date', 'release_date', 'album release date', 'release year', 'release_year', 'year']));
    const suppliedGenre = classifyGenre(pick(row, ['artist genres', 'genres', 'genre', 'genre_family']));
    const latitudeText = pick(row, ['latitude', 'origin latitude', 'origin_latitude']);
    const latitude = Number(latitudeText);
    const longitude = Number(pick(row, ['longitude', 'origin longitude', 'origin_longitude']));
    const suppliedPoint = Number.isFinite(latitude) && Number.isFinite(longitude) && latitudeText !== '' ? project(latitude, longitude) : null;
    const hasSupplied = Boolean(suppliedYear || suppliedGenre !== 'Other' || suppliedPoint);
    const inferredGenre = knownArtist?.genre ?? globalArtist?.family ?? 'Other';
    return {
      ...artwork,
      spotifyTrackId: id || null,
      track: track || 'Untitled track', artist: artist || 'Unknown artist',
      year: suppliedYear ?? knownArtist?.year ?? null,
      genre: suppliedGenre !== 'Other' ? suppliedGenre : inferredGenre,
      ...(globalArtist ? { genreSpaceX: globalArtist.x, genreSpaceY: globalArtist.y, genreSpacePrimary: globalArtist.primary, genreSpaceGenres: globalArtist.genres } : {}),
      x: suppliedPoint?.x ?? knownArtist?.x ?? null, y: suppliedPoint?.y ?? knownArtist?.y ?? null,
      city: pick(row, ['city', 'origin city', 'origin_city']) || knownArtist?.city || '',
      country: pick(row, ['country', 'origin country', 'origin_country']) || knownArtist?.country || '',
      method: hasSupplied ? 'uploaded metadata' : knownArtist || globalArtist ? 'artist inference' : 'fallback',
      genreSource: suppliedGenre !== 'Other' ? 'visitor CSV' : knownArtist ? 'Songs for Self artist catalog inference' : globalArtist ? `${globalArtist.method}; ${globalArtist.sourceUrl}` : 'unresolved',
      genreConfidence: suppliedGenre !== 'Other' ? 'user-supplied' : knownArtist ? 'low' : globalArtist ? 'medium' : 'unresolved',
      timeSource: suppliedYear ? 'visitor CSV' : knownArtist?.year ? 'Songs for Self artist catalog inference' : 'unresolved',
      timeConfidence: suppliedYear ? 'user-supplied' : knownArtist?.year ? 'low' : 'unresolved',
      geographySource: suppliedPoint ? 'visitor CSV' : knownArtist?.x !== null && knownArtist?.x !== undefined ? 'Songs for Self artist catalog inference' : 'unresolved',
      geographyConfidence: suppliedPoint ? 'user-supplied' : knownArtist?.x !== null && knownArtist?.x !== undefined ? 'low' : 'unresolved',
    };
  });
}

export function aggregateTimeline(tracks: AnalyzedTrack[]) {
  const counts = new Map<string, { genre: string; year: number; count: number }>();
  for (const track of tracks) if (track.year) {
    const key = `${track.genre}|${track.year}`;
    const point = counts.get(key) ?? { genre: track.genre, year: track.year, count: 0 };
    point.count += 1;
    counts.set(key, point);
  }
  return [...counts.values()];
}

export function aggregatePlaces(tracks: AnalyzedTrack[]) {
  const counts = new Map<string, { x: number; y: number; count: number; label: string }>();
  for (const track of tracks) if (track.x !== null && track.y !== null) {
    const key = `${track.x.toFixed(1)}|${track.y.toFixed(1)}`;
    const place = counts.get(key) ?? { x: track.x, y: track.y, count: 0, label: track.city || track.country || 'Known origin' };
    place.count += 1;
    counts.set(key, place);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function parseCsv(text: string): Record<string, string>[] {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(Boolean)) table.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  row.push(cell);
  if (row.some(Boolean)) table.push(row);
  const headers = (table.shift() ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
  return table.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
}

export function classifyGenre(value: string) {
  const genre = normalize(value);
  const rules: [string, string[]][] = [
    ['Classical', ['classical', 'baroque', 'opera', 'orchestral', 'symphony']],
    ['Experimental', ['experimental', 'avant garde', 'noise', 'drone', 'industrial']],
    ['Country', ['country', 'americana', 'bluegrass', 'honky tonk']],
    ['Electronic', ['electronic', 'indietronica', 'synthwave', 'downtempo', 'idm', 'ambient', 'house', 'techno', 'trance', 'disco']],
    ['Modern Folk', ['indie folk', 'folk rock', 'contemporary folk', 'singer songwriter']],
    ['Hip-hop', ['hip hop', 'rap', 'trap', 'grime']],
    ['Jazz', ['jazz', 'bebop', 'swing']],
    ['Pop', ['pop', 'electropop']],
    ['R&B, Soul & Blues', ['r b', 'rnb', 'soul', 'funk', 'blues', 'motown']],
    ['Rock', ['rock', 'punk', 'metal', 'grunge']],
    ['World', ['world', 'reggae', 'latin', 'afrobeat', 'highlife', 'qawwali', 'samba', 'cumbia']],
    ['Traditional Folk', ['traditional folk', 'traditional music', 'indigenous music']],
  ];
  return rules.find(([, terms]) => terms.some((term) => genre.includes(term)))?.[0] ?? 'Other';
}

function pick(row: Record<string, string>, candidates: string[]) {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const found = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(candidate));
    if (found?.[1]) return found[1];
  }
  return '';
}

function normalizeHeader(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function normalize(value: string) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function trackKey(track: string, artist: string) { return `${normalize(track)}|${normalize(String(artist).split(/[;,]/)[0])}`; }
function spotifyId(value: string) { const match = value.match(/(?:track[:/])([A-Za-z0-9]{22})/); return match?.[1] ?? value.trim(); }
function parseYear(value: string) { const match = value.match(/(?:1[2-9]|20)\d{2}/); const year = match ? Number(match[0]) : null; return year && year <= new Date().getFullYear() ? year : null; }
function project(latitude: number, longitude: number) { return { x: 8 + ((longitude + 180) / 360) * 984, y: 8 + ((90 - latitude) / 180) * 484 }; }
