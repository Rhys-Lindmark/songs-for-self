import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
import type { VisitorGenrePlacement } from '@/lib/visitor-genre-space';

export type GenreListeningBenchmark = {
  version: string; name: string; geography: string; period: string; unit: string;
  sourceUrl: string; chartUrl: string; taxonomyUrl?: string;
  publishedShareTotal: number; unlistedShareRemainder?: number;
  buckets: Array<{ id: string; label: string; share: number | null }>;
  notes?: string[];
};
export type GenreRank = { id: string; label: string; count: number; share: number };
export type GenreComparison = GenreRank & { benchmarkShare: number; ratio: number | null; deltaPoints: number };
export type GenreProfile = {
  broad: GenreRank[]; detailed: GenreRank[]; total: number; classified: number; unclassified: number;
  comparisons: GenreComparison[]; aligned: number; unaligned: number; standout?: GenreComparison;
};
const broadFamilies = ['Classical', 'Experimental', 'Country', 'Electronic', 'Modern Folk', 'Hip-hop', 'Jazz', 'Pop', 'R&B, Soul & Blues', 'Rock', 'World', 'Traditional Folk'];
const broadByKey = new Map(broadFamilies.map((label) => [key(label), label]));
const detailAliases: Record<string, string> = {
  'hip hop': 'Hip-hop', hiphop: 'Hip-hop', 'hip hop rap': 'Hip-hop', 'r and b': 'R&B', rnb: 'R&B', 'rhythm and blues': 'R&B',
  'synth pop': 'Synthpop', synthpop: 'Synthpop', 'dance pop': 'Dance-pop', 'k pop': 'K-pop', kpop: 'K-pop',
  'singer songwriter': 'Singer-songwriter', 'neo soul': 'Neo soul', 'latin pop': 'Latin pop', latinpop: 'Latin pop', 'drum and bass': 'Drum and bass',
};
const directBroadBuckets: Record<string, string> = { Classical: 'classical', Country: 'country', Electronic: 'dance-electronic', 'Hip-hop': 'rnb-hip-hop', Jazz: 'jazz', Pop: 'pop', Rock: 'rock' };

/** A descriptive playlist-row profile, plus a conservative crosswalk to published market shares. */
export function buildGenreProfile(tracks: AnalyzedTrack[], benchmark: GenreListeningBenchmark, placements: VisitorGenrePlacement[] = [], weights?: number[]): GenreProfile {
  if (weights && (weights.length !== tracks.length || weights.some((value) => !Number.isFinite(value) || value < 0))) throw new Error('Genre weights must be finite, nonnegative and aligned with the tracks.');
  const total = weights ? weights.reduce((sum, value) => sum + value, 0) : tracks.length;
  if (!Number.isFinite(total)) throw new Error('Genre weights exceed the supported total.');
  const byPlacement = new Map(placements.map((placement) => [placement.index, placement]));
  const broadCounts = new Map<string, { label: string; count: number }>();
  const detailCounts = new Map<string, { label: string; count: number }>();
  const comparisonCounts = new Map<string, number>();
  const buckets = new Map(benchmark.buckets.filter((bucket) => typeof bucket.share === 'number' && Number.isFinite(bucket.share) && bucket.share >= 0 && bucket.share <= 100).map((bucket) => [bucket.id, bucket]));
  let classified = 0;
  let aligned = 0;
  tracks.forEach((track, index) => {
    const weight = weights?.[index] ?? 1;
    if (weight === 0) return;
    const placement = byPlacement.get(index);
    const detail = primaryDetailedGenre(track, placement);
    const fromPlacement = placement && !isSyntheticPlacement(placement) ? broadFamily(placement.family) : undefined;
    const broad = broadFamily(track.genre) || fromPlacement || (detail ? inferBroad(detail) : undefined);
    if (broad) {
      classified += weight;
      increment(broadCounts, key(broad), broad, weight);
    }
    const label = detail || broad;
    if (label) increment(detailCounts, key(label), label, weight);
    // Fine evidence can override the broad crosswalk (e.g. Latin pop, K-pop, Christian rock, or explicit Blues).
    const fineBucket = detail ? benchmarkBucket(detail) : undefined;
    const cohort = fineBucket === null ? undefined : fineBucket || (broad ? directBroadBuckets[broad] : undefined);
    if (cohort && buckets.has(cohort)) {
      aligned += weight;
      comparisonCounts.set(cohort, (comparisonCounts.get(cohort) || 0) + weight);
    }
  });
  const rank = (counts: Map<string, { label: string; count: number }>): GenreRank[] => [...counts].map(([id, row]) => ({ id, ...row, share: total ? row.count / total * 100 : 0 })).sort(compareRanks).slice(0, 10);
  const comparisons: GenreComparison[] = [...comparisonCounts].map(([id, count]) => {
    const bucket = buckets.get(id)!;
    const share = total ? count / total * 100 : 0;
    const benchmarkShare = bucket.share!;
    return { id, label: bucket.label, count, share, benchmarkShare, ratio: benchmarkShare > 0 ? share / benchmarkShare : null, deltaPoints: share - benchmarkShare };
  }).sort(compareRanks);
  const standout = total >= 10 && aligned >= total / 2 ? comparisons.filter((row) => row.count >= 3 && row.share >= 5 && row.deltaPoints > 0).sort((a, b) => b.deltaPoints - a.deltaPoints || compareRanks(a, b))[0] : undefined;
  return { broad: rank(broadCounts), detailed: rank(detailCounts), total, classified, unclassified: total - classified, comparisons, aligned, unaligned: total - aligned, ...(standout ? { standout } : {}) };
}
function primaryDetailedGenre(track: AnalyzedTrack, placement?: VisitorGenrePlacement): string | undefined {
  // Exact track memberships precede uploaded labels; family-centroid decorations never become genres.
  const precisePlacement = placement && !isSyntheticPlacement(placement);
  const placementLabel = precisePlacement ? meaningful(placement.primary) : undefined;
  const references = precisePlacement ? placement.referenceGenres.map(meaningful).filter((label): label is string => Boolean(label)) : [];
  if (precisePlacement && /exact/i.test(placement.method)) return choosePrimary(placementLabel, references) || firstMeaningful(track.suppliedGenres) || placementLabel;
  const supplied = firstMeaningful(track.suppliedGenres);
  if (supplied) return supplied;
  if (precisePlacement) {
    const candidate = choosePrimary(placementLabel, references) || placementLabel;
    if (candidate) return candidate;
  }
  if (!/description|fallback|family.centroid/i.test(track.genreSource)) {
    const primary = meaningful(track.genreSpacePrimary);
    const genres = (track.genreSpaceGenres || []).map(meaningful).filter((label): label is string => Boolean(label));
    return choosePrimary(primary, genres) || primary;
  }
  return undefined;
}
function choosePrimary(primary: string | undefined, labels: string[]): string | undefined { return primary && labels.some((label) => key(label) === key(primary)) ? primary : labels[0]; }
function firstMeaningful(values?: string[]): string | undefined { return values?.map(meaningful).find((value): value is string => Boolean(value)); }
function meaningful(value?: string): string | undefined {
  const normalized = key(value || '');
  if (!normalized || /^(?:other|unknown|unresolved|unspecified|none|n a)$/u.test(normalized) || /fallback|centroid|neighbou?rhood|insufficient evidence|artist inference|musician|musical group/u.test(normalized)) return undefined;
  return detailAliases[normalized] || (normalized[0].toUpperCase() + normalized.slice(1));
}
function isSyntheticPlacement(placement: VisitorGenrePlacement): boolean { return /family.*(?:centroid|fallback)|unresolved/i.test(placement.method) || /description/i.test(placement.source) || /uploaded genre fallback|artist neighbou?rhood/i.test(placement.primary); }
function broadFamily(value: string): string | undefined {
  const normalized = key(value);
  return broadByKey.get(normalized) || (normalized === 'hiphop' ? 'Hip-hop' : normalized === 'rnb soul and blues' || normalized === 'r and b soul blues' ? 'R&B, Soul & Blues' : undefined);
}
function inferBroad(detail: string): string | undefined {
  const normalized = key(detail);
  if (/\bblues\b/u.test(normalized) && normalized !== 'rhythm and blues') return 'R&B, Soul & Blues';
  const cohort = benchmarkBucket(detail);
  if (cohort === 'rnb-hip-hop') return /\b(?:hip hop|hiphop|rap|trap|drill)\b/u.test(normalized) ? 'Hip-hop' : 'R&B, Soul & Blues';
  return ({ classical: 'Classical', country: 'Country', 'dance-electronic': 'Electronic', jazz: 'Jazz', pop: 'Pop', rock: 'Rock', latin: 'World', world: 'World' } as Record<string, string>)[cohort || ''];
}
/** null means explicit fine evidence prevents a broader guess; undefined permits supported broad fallback. */
function benchmarkBucket(label: string): string | null | undefined {
  const genre = key(label);
  // Unreported or cross-taxonomy categories have no defensible baseline in the selected table.
  if (/\bblues\b/u.test(genre) && genre !== 'rhythm and blues') return null;
  if (/\b(?:soundtrack|film score|video game music|comedy|spoken word|audiobook|new age|holiday|easy listening)\b/u.test(genre) || /^(?:latin jazz|jazz rock|jazz rap|rap rock|country rap|country pop|folk pop)$/u.test(genre)) return null;
  if (/\b(?:latin pop|latin trap|latin hip hop|latin rock|reggaeton|bachata|salsa|cumbia|merengue|bossa nova|samba|mpb|forro|pagode|sertanejo|norteno|ranchera|corrido|mariachi|musica mexicana)\b/u.test(genre)) return 'latin';
  if (/\b(?:k pop|kpop|afrobeats|afrobeat|afropop|reggae|dancehall|soca|calypso)\b/u.test(genre)) return 'world';
  if (/\b(?:christian|gospel|worship)\b/u.test(genre) || genre === 'ccm') return 'christian-gospel';
  if (/\b(?:children|childrens|kids music|nursery rhymes|lullaby|lullabies)\b/u.test(genre)) return 'children';
  if (genre === 'r and b' || genre === 'rnb' || genre === 'rhythm and blues' || /\bsoul\b/u.test(genre) || genre === 'funk') return 'rnb-hip-hop';
  if (/\b(?:hip hop|hiphop|rap|trap|drill)\b/u.test(genre)) return 'rnb-hip-hop';
  if (/\bjazz\b/u.test(genre) || /^(?:bebop|hard bop|bop|swing|big band)$/u.test(genre)) return 'jazz';
  if (/\bclassical\b/u.test(genre) || /^(?:baroque|renaissance|medieval|opera|chamber music|orchestral|symphony|romantic music|minimalism)$/u.test(genre)) return 'classical';
  if (/\bcountry\b/u.test(genre) || /\bbluegrass\b/u.test(genre) || /^(?:folk|folk music)$/u.test(genre)) return 'country';
  if (/\brock\b/u.test(genre) || /\bmetal\b/u.test(genre) || /^(?:grunge|punk|post punk|hardcore punk|shoegaze)$/u.test(genre)) return 'rock';
  if (/\bpop\b/u.test(genre) || /^(?:synthpop|electropop|hyperpop)$/u.test(genre)) return 'pop';
  if (/\b(?:electronic|electronica|edm|house|techno|trance|dubstep|drum and bass|idm)\b/u.test(genre)) return 'dance-electronic';
  return undefined;
}
function increment(map: Map<string, { label: string; count: number }>, id: string, label: string, weight: number): void { const row = map.get(id); if (row) row.count += weight; else map.set(id, { label, count: weight }); }
function compareRanks(a: GenreRank, b: GenreRank): number { return b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
function key(value: string): string { return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’ʼ]/gu, '').replace(/&/gu, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
