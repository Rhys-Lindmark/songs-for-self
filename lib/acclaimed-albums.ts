import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
import type { GenreSpacePayload, GenreSpacePoint } from '@/components/genre-space-map';

export type AcclaimedAlbum = {
  id: string; title: string; artist: string; year: number | null;
  sources: Array<{ name: string; url: string; detail?: string }>;
  musicBrainzReleaseGroupId?: string; spotifyAlbumIds?: string[]; titleAliases?: string[]; artistAliases?: string[];
};
export type AcclaimedAlbumCatalog = {
  version: string; albums: AcclaimedAlbum[]; title?: string; description?: string;
  [key: string]: unknown;
};
export type AcclaimedAlbumMatch = { trackIndex: number; albumId: string; method: string; evidence: string };
export type AcclaimedAlbumCoverageResult = {
  covered: number; total: number; percent: number; matches: AcclaimedAlbumMatch[];
  unmatched: Array<{ trackIndex: number; reason: string }>;
};

type AlbumIndex = { byTitle: Map<string, AcclaimedAlbum[]>; bySpotifyId: Map<string, AcclaimedAlbum[]> };

/** A playlist covers an album only when its album identity is supported, never just its artist or song title. */
export function scoreAcclaimedAlbums(tracks: AnalyzedTrack[], catalog: AcclaimedAlbumCatalog, options: { atlas?: GenreSpacePayload } = {}): AcclaimedAlbumCoverageResult {
  const index: AlbumIndex = { byTitle: new Map(), bySpotifyId: new Map() };
  for (const album of catalog.albums) {
    for (const title of [album.title, ...(album.titleAliases || [])]) addAlbum(index.byTitle, normalizeAlbumTitle(title), album);
    for (const id of album.spotifyAlbumIds || []) addAlbum(index.bySpotifyId, spotifyAlbumId(id), album);
  }
  // Atlas IDs are accepted only after exact album-title AND artist verification against this catalog.
  const atlasAlbumIds = new Map<string, AcclaimedAlbum[]>();
  const atlasTracks = new Map<string, GenreSpacePoint[]>();
  for (const point of options.atlas?.points || []) {
    for (const id of new Set([point.id, point.spotifyTrackId].filter((id): id is string => Boolean(id)))) {
      const points = atlasTracks.get(id) || []; points.push(point); atlasTracks.set(id, points);
    }
    const verified = findByMetadata(point.album, point.artists, index);
    if (verified.length === 1 && point.spotifyAlbumId) addAlbum(atlasAlbumIds, spotifyAlbumId(point.spotifyAlbumId), verified[0]);
  }
  const matches: AcclaimedAlbumMatch[] = [];
  const unmatched: AcclaimedAlbumCoverageResult['unmatched'] = [];
  tracks.forEach((track, trackIndex) => {
    const suppliedTitle = usableTitle(track.album);
    const suppliedAlbumArtist = usableArtist((track as AnalyzedTrack & { albumArtist?: string }).albumArtist);
    const suppliedArtist = suppliedAlbumArtist || usableArtist(track.artist);
    const suppliedId = spotifyAlbumId(track.spotifyAlbumId);
    const trusted = suppliedId ? index.bySpotifyId.get(suppliedId) || [] : [];
    if (trusted.length) {
      if (trusted.length !== 1) { unmatched.push({ trackIndex, reason: 'The supplied Spotify album ID is ambiguous in this catalog.' }); return; }
      if (!metadataCompatible(suppliedTitle, suppliedArtist, trusted[0])) {
        unmatched.push({ trackIndex, reason: 'The supplied album title or artist conflicts with the catalog identity for this Spotify album ID.' }); return;
      }
      matches.push({ trackIndex, albumId: trusted[0].id, method: 'catalog Spotify album ID', evidence: `${suppliedId} identifies ${trusted[0].title} by ${trusted[0].artist}` }); return;
    }
    const learned = suppliedId ? atlasAlbumIds.get(suppliedId) || [] : [];
    if (learned.length) {
      if (learned.length !== 1) { unmatched.push({ trackIndex, reason: 'The reference album ID has conflicting catalog identities.' }); return; }
      if (!metadataCompatible(suppliedTitle, suppliedArtist, learned[0])) {
        unmatched.push({ trackIndex, reason: 'Supplied album or artist metadata conflicts with the reference identity for this album ID.' }); return;
      }
      matches.push({ trackIndex, albumId: learned[0].id, method: 'Spotify album ID verified against reference atlas', evidence: `${suppliedId}; reference album title and artist both identify ${learned[0].title} by ${learned[0].artist}` }); return;
    }
    const referencePoints = track.spotifyTrackId ? atlasTracks.get(track.spotifyTrackId) || [] : [];
    const direct = findByMetadata(suppliedTitle, suppliedArtist, index);
    if (direct.length === 1) {
      const referenceConflict = referencePoints.some((point) => !metadataCompatible(point.album, suppliedAlbumArtist ? '' : point.artists, direct[0]));
      if (referenceConflict) { unmatched.push({ trackIndex, reason: 'The exact-track reference album conflicts with the supplied listed album identity; a verified album ID is needed for a different release.' }); return; }
      matches.push({ trackIndex, albumId: direct[0].id, method: 'album title and artist', evidence: `${track.album} · ${suppliedArtist}; exact normalized title and complete artist identity, with recognized edition suffixes only` }); return;
    }
    if (direct.length > 1) { unmatched.push({ trackIndex, reason: 'The supplied album title and artist match multiple catalog entries; no album was chosen.' }); return; }
    if (referencePoints.length) {
      const candidates = new Map<string, { album: AcclaimedAlbum; point: GenreSpacePoint }>();
      let conflict = false;
      for (const point of referencePoints) {
        const referenceMatches = findByMetadata(point.album, point.artists, index);
        if (referenceMatches.length !== 1) continue;
        const album = referenceMatches[0];
        // An exact song may occur on several releases. Never replace an explicit compilation/re-recording/other album.
        if (!metadataCompatible(suppliedTitle, suppliedArtist, album) || (suppliedId && suppliedId !== spotifyAlbumId(point.spotifyAlbumId))) { conflict = true; continue; }
        candidates.set(album.id, { album, point });
      }
      if (candidates.size === 1 && !conflict) {
        const { album, point } = [...candidates.values()][0];
        matches.push({ trackIndex, albumId: album.id, method: 'exact track reference album metadata', evidence: `Exact track ID ${track.spotifyTrackId}; reference album ${point.album} by ${point.artists}. Supplied fields were preserved and checked.` }); return;
      }
      if (conflict) { unmatched.push({ trackIndex, reason: 'The exact-track reference album conflicts with supplied album, artist, or album-ID metadata; supplied metadata was preserved.' }); return; }
      if (candidates.size > 1) { unmatched.push({ trackIndex, reason: 'The exact track appears on multiple listed reference albums; album metadata is needed to choose one.' }); return; }
    }
    const missing = !suppliedTitle && !suppliedId ? 'Album title or a verified Spotify album ID is missing.' : !suppliedArtist && !suppliedId ? 'Artist identity is missing; album title alone does not earn credit.' : !suppliedTitle && suppliedId ? 'This Spotify album ID is not verified in the catalog or reference atlas, and album metadata is missing.' : 'This album title and artist are not recognized in this catalog; compilations, live versions, and re-recordings are separate releases.';
    unmatched.push({ trackIndex, reason: missing });
  });
  const covered = new Set(matches.map((match) => match.albumId)).size;
  const total = catalog.albums.length;
  return { covered, total, percent: total ? covered / total * 100 : 0, matches, unmatched };
}

function addAlbum(index: Map<string, AcclaimedAlbum[]>, key: string, album: AcclaimedAlbum): void {
  if (!key) return;
  const albums = index.get(key) || [];
  if (!albums.some((candidate) => candidate.id === album.id)) albums.push(album);
  index.set(key, albums);
}
function findByMetadata(title: string | null | undefined, artist: string | null | undefined, index: AlbumIndex): AcclaimedAlbum[] {
  if (!usableTitle(title) || !usableArtist(artist)) return [];
  return (index.byTitle.get(normalizeAlbumTitle(title!)) || []).filter((album) => artistMatches(artist!, album));
}
function metadataCompatible(title: string | null | undefined, artist: string | null | undefined, album: AcclaimedAlbum): boolean {
  return (!title || [album.title, ...(album.titleAliases || [])].some((candidate) => normalizeAlbumTitle(candidate) === normalizeAlbumTitle(title))) && (!artist || artistMatches(artist, album));
}
function artistMatches(artist: string, album: AcclaimedAlbum): boolean {
  const artistKeys = new Set([album.artist, ...(album.artistAliases || [])].map(normalizeIdentity));
  const units = artist.split(';').map((part) => part.trim()).filter(Boolean);
  const commaJoint = artist.includes(',') ? artist.split(',').map((part) => part.trim()).filter(Boolean).join(' and ') : '';
  // The main artist may have guests, but a guest alone is never treated as the album artist.
  return artistKeys.has(normalizeIdentity(artist)) || (units.length > 0 && artistKeys.has(normalizeIdentity(units[0]))) || (units.length > 1 && artistKeys.has(normalizeIdentity(units.join(' and ')))) || (Boolean(commaJoint) && artistKeys.has(normalizeIdentity(commaJoint)));
}
function usableTitle(value: string | null | undefined): string {
  const key = normalizeIdentity(value || ''); return key && key !== 'unknown album' ? value!.trim() : '';
}
function usableArtist(value: string | null | undefined): string {
  const key = normalizeIdentity(value || ''); return key && key !== 'unknown artist' ? value!.trim() : '';
}
function normalizeIdentity(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’ʼ]/gu, '').replace(/&/gu, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function spotifyAlbumId(value: string | null | undefined): string {
  const input = String(value || '').trim();
  return input.match(/(?:spotify:album:|open\.spotify\.com\/(?:intl-[^/]+\/)?album\/)([A-Za-z0-9]{22})/u)?.[1] || input;
}
/** Deliberately does not remove Live, re-recorded, tribute, covers, remix, demo, or acoustic qualifiers. */
export function normalizeAcclaimedAlbumTitle(value: string): string { return normalizeAlbumTitle(value); }
function normalizeAlbumTitle(value: string): string {
  let title = value.trim();
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const suffix = title.match(/\s*[([]([^()[\]]+)[)\]]\s*$/u);
    if (suffix && safeEdition(suffix[1])) { title = title.slice(0, suffix.index).trim(); continue; }
    const separator = [...title.matchAll(/\s+[-–—:]\s+/gu)].at(-1);
    if (separator && safeEdition(title.slice(separator.index! + separator[0].length))) { title = title.slice(0, separator.index).trim(); continue; }
    const plain = title.match(/\s+((?:(?:super|\d{4}|\d+(?:st|nd|rd|th)|anniversary|digitally)\s+)*(?:remaster(?:ed)?(?:\s+(?:version|edition|\d{4}))?|deluxe(?:\s+(?:edition|version))?|expanded(?:\s+(?:edition|version))?))\s*$/iu);
    if (plain && plain.index && safeEdition(plain[1])) { title = title.slice(0, plain.index).trim(); continue; }
    break;
  }
  return normalizeIdentity(title || value);
}
function safeEdition(value: string): boolean {
  const key = normalizeIdentity(value);
  if (/\b(live|concert|rerecord(?:ed|ing)?|re record(?:ed|ing)?|tribute|covers?|karaoke|instrumental|demos?|sessions?|acoustic|unplugged|remix(?:ed)?|reimagined|redux|orchestral)\b/u.test(key) || /\btaylors version\b/u.test(key)) return false;
  if (!/\b(remaster(?:ed)?|deluxe|expanded|anniversary)\b/u.test(key)) return false;
  return key.split(' ').every((word) => /^(?:remaster|remastered|digitally|deluxe|super|expanded|edition|version|anniversary|bonus|track|tracks|with|original|new|the|stereo|mono|\d{4}|\d+(?:st|nd|rd|th))$/u.test(word));
}
