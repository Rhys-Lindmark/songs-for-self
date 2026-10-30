import type { AnalyzedTrack, GlobalArtistGenre, GlobalArtistGenreIndex } from '@/lib/playlist-analyzer';
import type { GenreSpacePayload } from '@/components/genre-space-map';

export type MusicArea = {
  id: string; label: string; family: string; era: string; startYear: number; endYear: number;
  x: number; y: number; region: string | null; sourceUrls: string[]; genreKeys: string[];
  kind: 'composer' | 'classical-period' | 'early-recorded' | 'modern';
  composerNames?: string[]; composerIds?: string[]; requiresYear?: boolean; editorial?: boolean;
};
export type CoverageTrackEvidence = { genres: string[]; year: number | null; reliableYear: boolean; source: string; artist: string; title: string; albumId: string | null };
export type MusicMapCatalog = {
  version: string; title?: string; description?: string; total?: number; sourceUrls?: string[];
  referenceVersion?: string; selection?: Record<string, unknown>; areas: MusicArea[];
  aliases?: Record<string, string>; trackEvidence?: Record<string, CoverageTrackEvidence>;
  albumEvidence?: Record<string, { genres: string[]; artist: string; source: string }>;
  historicalArtists?: Array<{ name: string; genre: string; year: number; aliases: string[]; spotifyIds?: string[]; sourceUrls: string[] }>;
};
export type CoverageMatch = { trackIndex: number; areaId: string; method: string; evidence: string; confidence: string; source?: string };
export type CoverageResult = {
  covered: number; total: number; percent: number; matches: CoverageMatch[];
  unmatched: Array<{ trackIndex: number; reason: string }>;
};
type CoverageTrack = AnalyzedTrack & { artistIds?: string[]; spotifyArtistIds?: string[]; suppliedGenres?: string[]; originalYear?: number | null; composer?: string };
type Candidate = { genres: string[]; method: string; evidence: string; confidence: string; source?: string };

/** Exact metadata lookup and frozen area IDs keep the score deterministic and auditable. */
export function scoreMusicCoverage(tracks: AnalyzedTrack[], catalog: MusicMapCatalog, options: { atlas?: GenreSpacePayload; artistIndex?: GlobalArtistGenreIndex } = {}): CoverageResult {
  const areas = catalog.areas;
  const aliases = new Map(Object.entries(catalog.aliases || {}).map(([key, value]) => [normalize(key), normalize(value)]));
  const canonical = (value: string) => aliases.get(normalize(value)) || normalize(value);
  const byGenre = new Map<string, MusicArea[]>();
  const byComposer = new Map<string, MusicArea>();
  const byComposerId = new Map<string, MusicArea>();
  for (const area of areas) {
    if (area.kind === 'composer') {
      for (const composer of area.composerNames || []) byComposer.set(normalize(composer), area);
      for (const id of area.composerIds || []) byComposerId.set(id, area);
    }
    else for (const key of area.genreKeys) {
      const label = canonical(key); const bucket = byGenre.get(label) || [];
      bucket.push(area); byGenre.set(label, bucket);
    }
  }
  const byArtistId = new Map<string, GlobalArtistGenre>();
  const byArtistName = new Map<string, GlobalArtistGenre | null>();
  for (const artist of options.artistIndex?.artists || []) {
    byArtistId.set(artist.id, artist);
    const key = normalize(artist.name);
    if (key) byArtistName.set(key, byArtistName.has(key) ? null : artist);
  }
  const atlasById = new Map((options.atlas?.points || []).map((point) => [point.id, point]));
  const exactByName = new Map<string, CoverageTrackEvidence | null>();
  for (const evidence of Object.values(catalog.trackEvidence || {})) {
    const key = trackKey(evidence.title, evidence.artist);
    const previous = exactByName.get(key);
    // Duplicate identical source rows are safe; conflicting evidence is ambiguous.
    exactByName.set(key, previous && JSON.stringify(previous.genres) !== JSON.stringify(evidence.genres) ? null : exactByName.has(key) && previous === null ? null : evidence);
  }
  const historicalById = new Map<string, NonNullable<MusicMapCatalog['historicalArtists']>[number]>();
  const historicalByName = new Map<string, NonNullable<MusicMapCatalog['historicalArtists']>[number]>();
  for (const artist of catalog.historicalArtists || []) {
    for (const id of artist.spotifyIds || []) historicalById.set(id, artist);
    for (const name of artist.aliases) historicalByName.set(normalize(name), artist);
  }
  const matches: CoverageMatch[] = [];
  const unmatched: CoverageResult['unmatched'] = [];
  tracks.forEach((input, trackIndex) => {
    const track = input as CoverageTrack;
    const names = splitArtists(track.artist);
    const ids = track.artistIds || track.spotifyArtistIds || [];
    const composer = (track.composer ? byComposer.get(normalize(track.composer)) : undefined) || ids.map((id) => byComposerId.get(id)).find(Boolean) || names.map((name) => byComposer.get(name)).find(Boolean) || composerFromTitle(track.track, byComposer);
    if (composer) {
      matches.push({ trackIndex, areaId: composer.id, method: 'identified composer', evidence: `${composer.label}; musical period inferred from the identified composer, not the recording or reissue date`, confidence: 'medium', source: composer.sourceUrls.join(' · ') });
      return;
    }
    const exact = (track.spotifyTrackId ? catalog.trackEvidence?.[track.spotifyTrackId] : undefined) || exactByName.get(trackKey(track.track, track.artist));
    const atlasPoint = track.spotifyTrackId ? atlasById.get(track.spotifyTrackId) : undefined;
    const artistMatches = ids.map((id) => byArtistId.get(id)).filter((artist): artist is GlobalArtistGenre => Boolean(artist));
    if (!artistMatches.length) for (const name of names) {
      const artist = byArtistName.get(name); if (artist) artistMatches.push(artist);
    }
    const historical = ids.map((id) => historicalById.get(id)).find(Boolean) || names.map((name) => historicalByName.get(name)).find(Boolean);
    const explicitYear = validYear(track.originalYear) ? track.originalYear! : null;
    if (historical) {
      const historicalYear = explicitYear ?? historical.year;
      const area = (byGenre.get(canonical(historical.genre)) || []).find((area) => area.kind === (historicalYear <= 1945 ? 'early-recorded' : 'modern') && contains(area, historicalYear));
      if (area) {
        matches.push({ trackIndex, areaId: area.id, method: explicitYear !== null ? 'reviewed historical artist + original year' : 'reviewed historical artist', evidence: explicitYear !== null ? `${historical.name} · reviewed ${historical.genre} identity; explicit original year ${explicitYear}` : `${historical.name} · ${historical.genre}; representative historical recording era inferred (${historical.year}), overriding possible reissue dates`, confidence: 'medium', source: historical.sourceUrls.join(' · ') });
        return;
      }
    }
    const year = explicitYear ?? (exact?.reliableYear ? exact.year : track.timeConfidence !== 'low' && track.timeConfidence !== 'unresolved' && validYear(track.year) ? track.year : null);
    const candidates: Candidate[] = [];
    if (exact?.genres.length) candidates.push({ genres: exact.genres, method: 'exact track evidence', evidence: exact.source, confidence: 'high', source: exact.source });
    if (atlasPoint && !/family[- ](?:reference|centroid)|fallback/.test(atlasPoint.method) && atlasPoint.referenceGenres?.length) candidates.push({ genres: atlasPoint.referenceGenres, method: 'exact genre-space track evidence', evidence: atlasPoint.source, confidence: atlasPoint.confidence, source: atlasPoint.source });
    if (track.suppliedGenres?.length) candidates.push({ genres: track.suppliedGenres, method: 'uploaded genre metadata', evidence: 'Explicit genre labels supplied with this track', confidence: 'user-supplied', source: 'Uploaded playlist' });
    if (track.spotifyAlbumId) {
      const album = catalog.albumEvidence?.[track.spotifyAlbumId];
      if (album && names.includes(normalize(album.artist))) candidates.push({ genres: album.genres, method: 'sourced album evidence', evidence: album.source, confidence: 'medium', source: album.source });
    }
    for (const artist of artistMatches) {
      if (/description/.test(artist.method)) continue;
      candidates.push({ genres: [artist.primary, ...artist.genres], method: ids.includes(artist.id) ? 'artist ID genre evidence' : 'unique artist name genre evidence', evidence: `${artist.name || artist.id} · ${artist.genres.join(', ')} · ${artist.method}`, confidence: 'medium', source: artist.sourceUrl });
    }
    if (track.genreSpaceGenres?.length && !/description|fallback|centroid/.test(track.genreSource)) candidates.push({ genres: track.genreSpaceGenres, method: 'retained artist genre evidence', evidence: track.genreSource, confidence: track.genreConfidence, source: track.genreSource });
    let needsYear = false;
    let outsideEra = false;
    for (const candidate of candidates) {
      let identifiedSpecificInTier = false;
      // Specific labels win inside one evidence tier; broad families are never manufactured into genres.
      const labels = [...new Set(candidate.genres.map(canonical))].sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length);
      for (const label of labels) {
        const targets = byGenre.get(label) || [];
        if (label === 'classical' && explicitYear !== null) {
          const periods = areas.filter((area) => area.kind === 'classical-period' && contains(area, explicitYear));
          if (periods.length === 1) {
            matches.push({ trackIndex, areaId: periods[0].id, method: candidate.method, evidence: `${candidate.evidence} · period inferred from reliable musical year ${year}; composer unspecified`, confidence: 'medium', source: candidate.source });
            return;
          }
        }
        const period = targets.find((area) => area.kind === 'classical-period');
        if (period) {
          matches.push({ trackIndex, areaId: period.id, method: candidate.method, evidence: `${candidate.evidence} · explicit ${period.era} label; composer-specific areas remain unclaimed`, confidence: candidate.confidence, source: candidate.source });
          return;
        }
        if (!targets.length) continue;
        identifiedSpecificInTier = true;
        const early = targets.filter((area) => area.kind === 'early-recorded');
        const modern = targets.filter((area) => area.kind === 'modern');
        let area: MusicArea | undefined;
        if (year !== null && year <= 1945) {
          area = early.find((area) => contains(area, year));
          if (!area) outsideEra = true;
        } else if (year !== null) {
          area = modern.find((area) => contains(area, year));
          if (!area) outsideEra = true;
        } else {
          // Every era-specific cell needs a date. Unsplit named styles may be recognized without one.
          area = modern.find((area) => !area.requiresYear);
          if (!area) needsYear = true;
        }
        if (area) {
          const dated = year !== null ? ` · ${explicitYear !== null ? 'original year' : 'year evidence'} ${year}` : ' · named style; modern-era context inferred, recording year unavailable';
          matches.push({ trackIndex, areaId: area.id, method: candidate.method, evidence: `${candidate.evidence}${dated}`, confidence: year === null && candidate.confidence === 'high' ? 'medium' : candidate.confidence, source: candidate.source });
          return;
        }
      }
      // Missing chronology for a known exact-track style cannot be repaired by an unrelated artist-wide tag.
      if (identifiedSpecificInTier) break;
    }
    unmatched.push({ trackIndex, reason: needsYear ? 'A specific style was identified, but its era needs a reliable original or release year.' : outsideEra ? 'Genre evidence exists, but no matching dated area exists in this version of the map.' : candidates.length ? 'Available genre labels do not identify a specific area in this map; broad-family and nearest-neighbor guesses do not earn coverage.' : 'No specific track, album, supplied genre, or unambiguous artist evidence was found.' });
  });
  const total = areas.length;
  const covered = new Set(matches.map((match) => match.areaId)).size;
  return { covered, total, percent: total ? covered / total * 100 : 0, matches, unmatched };
}

function normalize(value: string | null | undefined): string { return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function splitArtists(value: string): string[] { return String(value || '').split(/[;,]/).map(normalize).filter(Boolean); }
function trackKey(title: string, artist: string): string { return `${normalize(title)}|${normalize(artist)}`; }
function contains(area: MusicArea, year: number): boolean { return year >= area.startYear && year <= area.endYear; }
function validYear(year: number | null | undefined): boolean { return typeof year === 'number' && Number.isFinite(year) && Number.isInteger(year) && year >= 1000 && year <= 2026; }
function composerFromTitle(title: string, composers: Map<string, MusicArea>): MusicArea | undefined {
  // Only an explicit prefix such as “Bach: ...”; never substrings such as Bacharach/Bachbeat.
  const prefix = title.match(/^([^:]+):/u)?.[1];
  return prefix ? composers.get(normalize(prefix)) : undefined;
}
