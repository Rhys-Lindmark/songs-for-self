import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { classifyGenres, classifyRankedGenres } from './music-taxonomy.mjs';

const root = process.cwd();
const inputPath = path.join(root, 'data', 'songs-for-self.enriched.csv');
const overridePath = path.join(root, 'data', 'genre-overrides.json');
const decisionQueuePath = path.join(root, 'data', 'genre-decision-queue.json');
const musicBrainzGenreCachePath = path.join(root, 'data', 'musicbrainz-artist-genre-cache.json');
const musicBrainzReleaseGroupGenreCachePath = path.join(root, 'data', 'musicbrainz-release-group-genre-cache.json');
const discogsReleaseGenreCachePath = path.join(root, 'data', 'discogs-release-genre-cache.json');
const discogsReleaseGenreDecisionsPath = path.join(root, 'data', 'discogs-release-genre-decisions.json');
const wikidataGenreCachePath = path.join(root, 'data', 'wikidata-artist-genre-cache.json');
const publicPaths = [
  path.join(root, 'public', 'songs-for-self-v2.csv'),
  path.join(root, 'public', 'songs-for-self-v3.csv'),
];
const rows = parse(fs.readFileSync(inputPath, 'utf8'), { columns: true, skip_empty_lines: true });
const overrideDocument = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
const bestEffortDocument = JSON.parse(fs.readFileSync(path.join(root, 'data', 'genre-best-effort-batch-8.json'), 'utf8'));
const batchNineDocument = JSON.parse(fs.readFileSync(path.join(root, 'data', 'genre-overrides-batch-9.json'), 'utf8'));
const scopedDecisionDocuments = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 52, 54, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77].map((batch) => ({
  batch,
  document: JSON.parse(fs.readFileSync(path.join(root, 'data', `genre-overrides-batch-${batch}.json`), 'utf8')),
}));
const overrideEntries = [
  ...Object.entries(overrideDocument.artists),
  ...Object.entries(batchNineDocument.artists),
  ...Object.entries(bestEffortDocument.artists).map(([artist, decision]) => [artist, {
    ...decision,
    confidence: 'medium',
    evidence: ['playlist:track-album-artist-context', 'editorial:best-effort-review/2026-08-30'],
  }]),
];
const overrides = new Map(overrideEntries.map(([artist, decision]) => [normalize(artist), { artist, ...decision }]));
const decisionQueueDocument = JSON.parse(fs.readFileSync(decisionQueuePath, 'utf8'));
const decisionQueue = new Map(Object.entries(decisionQueueDocument.artists).map(([artist, decision]) => [normalize(artist), { artist, ...decision }]));
const musicBrainzGenreCache = fs.existsSync(musicBrainzGenreCachePath)
  ? JSON.parse(fs.readFileSync(musicBrainzGenreCachePath, 'utf8'))
  : { artists: {} };
const musicBrainzReleaseGroupGenreCache = fs.existsSync(musicBrainzReleaseGroupGenreCachePath)
  ? JSON.parse(fs.readFileSync(musicBrainzReleaseGroupGenreCachePath, 'utf8'))
  : { releaseGroups: {} };
const musicBrainzAlbumCache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'musicbrainz-cache.json'), 'utf8'));
const discogsReleaseGenreCache = fs.existsSync(discogsReleaseGenreCachePath)
  ? JSON.parse(fs.readFileSync(discogsReleaseGenreCachePath, 'utf8'))
  : { albums: {} };
const discogsReleaseGenreDecisions = fs.existsSync(discogsReleaseGenreDecisionsPath)
  ? JSON.parse(fs.readFileSync(discogsReleaseGenreDecisionsPath, 'utf8'))
  : { albums: {} };
const wikidataGenreCache = fs.existsSync(wikidataGenreCachePath)
  ? JSON.parse(fs.readFileSync(wikidataGenreCachePath, 'utf8'))
  : { artists: {} };
const reviewedAt = `${overrideDocument.updatedAt}T00:00:00.000Z`;
const matchedArtists = new Set();
let changedRows = 0;
let cascadeRows = 0;
let musicBrainzRows = 0;
let musicBrainzReleaseGroupRows = 0;
let discogsReleaseRows = 0;
let discogsReviewedRows = 0;
const scopedDecisionRows = new Map(scopedDecisionDocuments.map(({ batch }) => [batch, 0]));
let wikidataRows = 0;
const tagCascade = new Map(Object.entries({
  'trip hop': 'Electronic', electro: 'Electronic', 'alternative dance': 'Electronic', eurodance: 'Electronic',
  breakcore: 'Electronic', synthwave: 'Electronic', chiptune: 'Electronic', chillwave: 'Electronic',
  'dance music': 'Electronic', 'film score': 'Classical', 'early music': 'Classical', chanson: 'Pop',
  'bubblegum music': 'Pop', kayōkyoku: 'Pop', blackgaze: 'Rock', 'beat music': 'Rock', psychobilly: 'Rock',
  nerdcore: 'Hip-hop', 'tejano music': 'Country', 'celtic music': 'Traditional Folk',
  'musical play': 'Pop', 'stage and screen': 'Pop', 'acoustic music': 'Modern Folk',
  'art music': 'Classical', ballad: 'Modern Folk', 'a cappella': 'Pop',
  'neo-medieval music': 'Traditional Folk', 'easy listening': 'Pop', 'novelty music': 'Pop',
  'alternative music': 'Rock', 'dub music': 'World', 'performance art': 'Experimental',
  'son cubano': 'World', sertanejo: 'World', 'afro-peruvian music': 'World', electrotango: 'World',
  punta: 'World', 'music of portugal': 'World', 'pagode baiano': 'World', 'romani music': 'World',
  zouk: 'World', 'música criolla': 'World', dancehall: 'World', zouglou: 'World', junkanoo: 'World',
  mbalax: 'World', 'music of ireland': 'Traditional Folk', bachata: 'World', chamamé: 'World',
  'nueva trova': 'World', isicathamiya: 'World', 'cải lương': 'World',
}));
const stableRows = rows.filter((row) => row.spotify_track_id
  && row.genre_family !== 'Other'
  && !row.genre_source.startsWith('inferred:catalog-')
  && !row.genre_source.startsWith('editorial:genre-evidence-batch-'));
const albumFamilies = groupFamilies(stableRows, (row) => row.spotify_album_id ? [row.spotify_album_id] : []);
const artistFamilies = groupFamilies(stableRows, (row) => row.artist_names.split(';').map((artist) => normalize(artist)));

const output = rows.map((row) => {
  if (!row.spotify_track_id) return row;
  // Exact reviewed corrections outrank older artist-wide defaults. Retain
  // decisions still follow the normal fallback path below.
  const scopedCorrection = applyScopedGenreDecision(row, { correctionsOnly: true });
  if (scopedCorrection) return scopedCorrection;
  const decision = row.artist_names
    .split(';')
    .map((artist) => overrides.get(normalize(artist)))
    .find(Boolean);
  if (!decision) {
    const queued = row.artist_names
      .split(';')
      .map((artist) => decisionQueue.get(normalize(artist)))
      .find(Boolean);
    if (!queued) return applyScopedGenreDecision(row) ?? applyDiscogsReviewedDecision(row) ?? applyMusicBrainzReleaseGroupEvidence(row) ?? applyDiscogsReleaseEvidence(row) ?? applyMusicBrainzEvidence(row) ?? applyWikidataEvidence(row) ?? applyCatalogPropagation(row) ?? applyTagCascade(row);
    const slug = normalize(queued.artist).replaceAll(' ', '-');
    const updated = {
      ...row,
      genre_family: 'Other',
      genre_primary: `decision queue: ${queued.issue}`,
      genre_secondary: '',
      genre_confidence: 'low',
      genre_source: `editorial:genre-decision-queue/${slug}`,
      genre_evidence: `editorial:product-decision/2026-08-30; ${queued.question}`,
      genre_estimated: 'false',
    };
    const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
    if (!changed) return row;
    changedRows += 1;
    return { ...updated, enriched_at: reviewedAt };
  }
  matchedArtists.add(decision.artist);
  const slug = normalize(decision.artist).replaceAll(' ', '-');
  const updated = {
    ...row,
    genre_family: decision.family,
    genre_primary: decision.primary || decision.family,
    genre_secondary: decision.secondary || '',
    genre_confidence: decision.confidence || 'high',
    genre_source: `editorial:genre-overrides/${slug}`,
    genre_evidence: decision.evidence.join('; '),
    genre_estimated: 'false',
  };
  if (decision.historicalPeriod) updated.historical_period = decision.historicalPeriod;
  if (decision.compositionYear) {
    updated.timeline_year = String(decision.compositionYear);
    updated.timeline_year_kind = 'estimated_composition';
    updated.timeline_year_confidence = decision.confidence || 'medium';
    updated.timeline_year_source = `editorial:genre-overrides/${slug}`;
  }
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
});

const beforeOther = rows.filter((row) => row.spotify_track_id && row.genre_family === 'Other').length;
const afterOther = output.filter((row) => row.spotify_track_id && row.genre_family === 'Other').length;
const csv = stringify(output, { header: true, columns: Object.keys(rows[0]) });
fs.writeFileSync(inputPath, csv);
for (const outputPath of publicPaths) fs.writeFileSync(outputPath, csv);

console.log(JSON.stringify({
  changedRows,
  matchedArtists: [...matchedArtists].sort((left, right) => left.localeCompare(right)),
  unmatchedOverrides: [...overrides.values()].map((entry) => entry.artist).filter((artist) => !matchedArtists.has(artist)),
  beforeOther,
  afterOther,
  cascadeRows,
  musicBrainzRows,
  musicBrainzReleaseGroupRows,
  discogsReleaseRows,
  discogsReviewedRows,
  scopedDecisionRows: Object.fromEntries(scopedDecisionRows),
  wikidataRows,
}, null, 2));

function applyScopedGenreDecision(row, { correctionsOnly = false } = {}) {
  const match = scopedDecisionDocuments.toReversed()
    .map(({ batch, document }) => {
      const trackDecision = document.tracks?.[row.spotify_track_id];
      const albumDecision = document.albums?.[row.spotify_album_id];
      return trackDecision
        ? { batch, decision: trackDecision, scope: `track/${row.spotify_track_id}` }
        : albumDecision
          ? { batch, decision: albumDecision, scope: `album/${row.spotify_album_id}` }
          : null;
    })
    .find(Boolean);
  if (!match) return null;
  const { batch, decision, scope } = match;
  const correction = decision.action === 'correct';
  if (correctionsOnly && !correction) return null;
  if (!correction && row.genre_family !== 'Other' && !row.genre_source.startsWith('editorial:genre-evidence-batch-') && !row.genre_source.startsWith('inferred:catalog-')) return null;
  const recoveredArtistNote = decision.artistNames
    ? `Artist identity recovered editorially as ${decision.artistNames}; evidence retained in genre_evidence.`
    : '';
  const updated = {
    ...row,
    artist_names: decision.artistNames || row.artist_names,
    genre_family: decision.family,
    genre_primary: decision.primary || decision.family,
    genre_secondary: decision.secondary || '',
    genre_confidence: decision.confidence || 'medium',
    genre_source: `editorial:genre-evidence-batch-${batch}/${scope}`,
    genre_evidence: `${decision.evidence.join('; ')}; ${decision.rationale}`,
    genre_estimated: 'false',
    notes: decision.artistNames
      ? [row.notes.replaceAll(recoveredArtistNote, '').trim(), recoveredArtistNote].filter(Boolean).join(' ')
      : row.notes,
  };
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  scopedDecisionRows.set(batch, scopedDecisionRows.get(batch) + 1);
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
}

function applyDiscogsReviewedDecision(row) {
  if (row.genre_family !== 'Other' && !row.genre_source.startsWith('discogs:release-genres/') && !row.genre_source.startsWith('editorial:discogs-release-review/')) return null;
  const decision = discogsReleaseGenreDecisions.albums?.[row.spotify_album_id];
  if (!decision || decision.action !== 'override') return null;
  const updated = {
    ...row,
    genre_family: decision.family,
    genre_primary: decision.primary || decision.family,
    genre_secondary: decision.secondary || '',
    genre_confidence: decision.confidence || 'medium',
    genre_source: `editorial:discogs-release-review/${row.spotify_album_id}`,
    genre_evidence: `${decision.evidence.join('; ')}; ${decision.rationale}`,
    genre_estimated: 'false',
  };
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  discogsReviewedRows += 1;
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
}

function applyMusicBrainzReleaseGroupEvidence(row) {
  if (row.genre_family !== 'Other' && !row.genre_source.startsWith('musicbrainz:release-group-genres/')) return null;
  const albumMatch = musicBrainzAlbumCache.albums?.[row.spotify_album_id];
  const evidence = albumMatch?.musicbrainzReleaseGroupId
    ? musicBrainzReleaseGroupGenreCache.releaseGroups?.[albumMatch.musicbrainzReleaseGroupId]
    : null;
  if (!evidence || evidence.retryable) return null;
  const directGenres = (evidence.genres ?? []).filter((item) => item.count > 0).slice(0, 8).map((item) => ({ ...item, kind: 'genre' }));
  const communityTags = (evidence.tags ?? []).filter((item) => item.count > 0).slice(0, 12).map((item) => ({ ...item, kind: 'tag' }));
  const evidenceItems = [...directGenres, ...communityTags];
  const labels = [...new Set(evidenceItems.map((item) => item.name))];
  if (!labels.length) return null;
  const classification = classifyRankedGenres(evidenceItems);
  if (classification.family === 'Other') return null;
  if (classification.family === 'World' && !hasPositiveWorldEvidence(evidenceItems.map((item) => item.name))) return null;
  const directGenreMatch = directGenres.some((item) => classification.normalizedGenres.includes(item.name.toLowerCase()));
  const confidence = directGenreMatch && Number(evidence.matchScore ?? 0) >= 95 ? 'high' : 'medium';
  const updated = {
    ...row,
    genre_family: classification.family,
    genre_primary: classification.primary,
    genre_secondary: classification.secondary,
    historical_period: classification.historicalPeriod || row.historical_period,
    genre_confidence: confidence,
    genre_source: `musicbrainz:release-group-genres/${evidence.musicbrainzReleaseGroupId}`,
    genre_evidence: `${evidence.sourceUrl}; exact release-group match ${evidence.matchedArtist} — ${evidence.matchedTitle}; MusicBrainz match score: ${evidence.matchScore ?? 'unknown'}; ${evidenceItems.map((item) => `MusicBrainz release-group ${item.kind}: ${item.name} (${item.count} votes)`).join('; ')}`,
    genre_estimated: 'false',
  };
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  musicBrainzReleaseGroupRows += 1;
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
}

function applyDiscogsReleaseEvidence(row) {
  if (row.genre_family !== 'Other' && !row.genre_source.startsWith('discogs:release-genres/')) return null;
  const evidence = discogsReleaseGenreCache.albums?.[row.spotify_album_id];
  const reviewDecision = discogsReleaseGenreDecisions.albums?.[row.spotify_album_id];
  if (reviewDecision?.action === 'reject') return null;
  if (!evidence?.matched || evidence.retryable) return null;
  const evidenceItems = [
    ...(evidence.genres ?? []).filter(isSpecificDiscogsGenre).map((name) => ({ name, count: 1, kind: 'genre' })),
    ...(evidence.styles ?? []).map((name) => ({ name, count: 1, kind: 'genre' })),
  ];
  const classification = classifyRankedGenres(evidenceItems);
  if (classification.family === 'Other') return null;
  if (classification.family === 'World' && !hasPositiveWorldEvidence(evidenceItems.map((item) => item.name))) return null;
  const exactMatch = evidence.matchMethod !== 'broad-query' && Number(evidence.titleSimilarity ?? 0) === 1 && Number(evidence.artistSimilarity ?? 0) === 1;
  const updated = {
    ...row,
    genre_family: classification.family,
    genre_primary: classification.primary,
    genre_secondary: classification.secondary,
    historical_period: classification.historicalPeriod || row.historical_period,
    genre_confidence: exactMatch ? 'high' : 'medium',
    genre_source: `discogs:release-genres/${evidence.discogsReleaseId}`,
    genre_evidence: `${evidence.sourceUrl}; Discogs ${evidence.matchMethod || 'fielded-query'} release match ${evidence.matchedTitle}; title similarity: ${evidence.titleSimilarity}; artist similarity: ${evidence.artistSimilarity}; ${evidence.genres.map((name) => `Discogs genre: ${name}`).join('; ')}${evidence.styles.length ? `; ${evidence.styles.map((name) => `Discogs style: ${name}`).join('; ')}` : ''}`,
    genre_estimated: 'false',
  };
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  discogsReleaseRows += 1;
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
}

function isSpecificDiscogsGenre(name) {
  return !/^folk,?\s*world,?\s*(?:&|and)\s*country$/i.test(String(name).trim());
}

function applyMusicBrainzEvidence(row) {
  if (row.genre_family !== 'Other' && !row.genre_source.startsWith('musicbrainz:artist-genres/')) return null;
  const primaryArtist = row.artist_names.split(';')[0].trim();
  const evidence = musicBrainzGenreCache.artists?.[primaryArtist];
  if (!evidence || evidence.retryable) return null;
  const directGenres = (evidence.genres ?? []).filter((item) => item.count > 0).slice(0, 8).map((item) => ({ ...item, kind: 'genre' }));
  const strongCommunityTags = (evidence.tags ?? []).filter((item) => item.count >= 2).slice(0, 12).map((item) => ({ ...item, kind: 'tag' }));
  const singletonTags = !directGenres.length && !strongCommunityTags.length
    ? (evidence.tags ?? []).filter((item) => item.count === 1).slice(0, 8).map((item) => ({ ...item, kind: 'tag' }))
    : [];
  const evidenceItems = [...directGenres, ...strongCommunityTags, ...singletonTags];
  const labels = [...new Set(evidenceItems.map((item) => item.name))];
  if (!labels.length) return null;
  const classification = classifyGenres(labels);
  if (classification.family === 'Other') return null;
  if (classification.family === 'World' && !hasPositiveWorldEvidence(evidenceItems.filter((item) => item.kind === 'genre' || item.count >= 2).map((item) => item.name))) return null;
  const wikidataAlternative = wikidataGenreCache.artists?.[primaryArtist];
  const wikidataClassification = classifyGenres(wikidataAlternative?.genres ?? []);
  const wikidataAlternativeIsUsable = wikidataClassification.family !== 'Other'
    && (wikidataClassification.family !== 'World' || hasPositiveWorldEvidence(wikidataAlternative.genres));
  if (singletonTags.length && wikidataAlternativeIsUsable) return null;
  const directGenreMatch = directGenres.some((item) => classification.normalizedGenres.includes(item.name.toLowerCase()));
  const confidence = directGenreMatch && Number(evidence.matchScore ?? 0) >= 95 ? 'high' : singletonTags.length ? 'low' : 'medium';
  const updated = {
    ...row,
    genre_family: classification.family,
    genre_primary: classification.primary,
    genre_secondary: classification.secondary,
    historical_period: classification.historicalPeriod || row.historical_period,
    genre_confidence: confidence,
    genre_source: `musicbrainz:artist-genres/${evidence.musicbrainzArtistId}`,
    genre_evidence: `${evidence.sourceUrl}; exact-name MusicBrainz match score: ${evidence.matchScore ?? 'unknown'}; ${evidenceItems.map((item) => `MusicBrainz ${item.kind}: ${item.name} (${item.count} votes)`).join('; ')}`,
    genre_estimated: 'false',
  };
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  musicBrainzRows += 1;
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
}

function hasPositiveWorldEvidence(labels) {
  const positiveTerms = ['world', 'world music', 'weltmusik', 'african', 'reggae', 'ska', 'latin', 'afrobeat', 'afrobeats', 'highlife', 'chimurenga', 'qawwali', 'raï', 'flamenco', 'bossa nova', 'samba', 'rumba', 'calypso', 'gamelan', 'cumbia', 'salsa', 'fado', 'klezmer', 'mariachi', 'axé', 'tango', 'electrotango', 'algerian chaabi', 'maloya', 'music of guadeloupe', 'soukous', 'rebetiko', 'laïko', 'arabic music', 'arabic', 'turkish', 'chalga', 'bollywood', 'timba', 'music of greece', 'cuban rumba', 'boogaloo', 'music of galicia', 'romani', 'zouk', 'indian classical', 'persian classical', 'hindustani classical', 'carnatic', 'hawaiian'];
  return labels.some((label) => positiveTerms.some((term) => label.toLowerCase() === term || label.toLowerCase().includes(term)));
}

function applyWikidataEvidence(row) {
  if (row.genre_family !== 'Other' && !row.genre_source.startsWith('wikidata:name/P136/')) return null;
  const primaryArtist = row.artist_names.split(';')[0].trim();
  const evidence = wikidataGenreCache.artists?.[primaryArtist];
  if (!evidence?.genres?.length) return null;
  const classification = classifyGenres(evidence.genres);
  if (classification.family === 'Other') return null;
  if (classification.family === 'World' && !hasPositiveWorldEvidence(evidence.genres)) return null;
  const updated = {
    ...row,
    genre_family: classification.family,
    genre_primary: classification.primary,
    genre_secondary: classification.secondary,
    historical_period: classification.historicalPeriod || row.historical_period,
    genre_confidence: 'medium',
    genre_source: `wikidata:name/P136/${evidence.wikidataId}`,
    genre_evidence: `${evidence.sourceUrl}; exact-name single musical candidate; ${evidence.genres.map((label) => `Wikidata P136: ${label}`).join('; ')}`,
    genre_estimated: 'false',
  };
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  wikidataRows += 1;
  changedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
}

function applyTagCascade(row) {
  if (row.genre_family !== 'Other') return row;
  const directTag = String(row.genre_primary || '').trim().toLowerCase();
  const family = tagCascade.get(directTag);
  if (!family) return row;
  cascadeRows += 1;
  changedRows += 1;
  return {
    ...row,
    genre_family: family,
    genre_confidence: 'medium',
    genre_source: `taxonomy-cascade:${row.genre_source}`,
    genre_evidence: `${row.genre_source}; direct genre tag: ${row.genre_primary}; editorial:tag-cascade/2026-08-30`,
    genre_estimated: 'false',
    enriched_at: reviewedAt,
  };
}

function applyCatalogPropagation(row) {
  if (row.genre_family !== 'Other') return null;
  const albumEvidence = dominantFamily(albumFamilies.get(row.spotify_album_id));
  const secondaryArtists = row.artist_names.split(';').slice(1).map((artist) => artist.trim()).filter(Boolean);
  const secondaryEvidence = secondaryArtists.map((artist) => ({ artist, evidence: dominantFamily(artistFamilies.get(normalize(artist))) })).find((item) => item.evidence);
  const selected = albumEvidence
    ? { ...albumEvidence, method: 'album', key: row.spotify_album_id, confidence: 'medium' }
    : secondaryEvidence
      ? { ...secondaryEvidence.evidence, method: 'featured-artist', key: normalize(secondaryEvidence.artist), confidence: 'low' }
      : null;
  if (!selected) return null;
  changedRows += 1;
  return {
    ...row,
    genre_family: selected.family,
    genre_primary: row.genre_primary === 'other / insufficient evidence' ? selected.family : row.genre_primary,
    genre_confidence: selected.confidence,
    genre_source: `inferred:catalog-${selected.method}/${selected.key}`,
    genre_evidence: `${selected.count}/${selected.total} related playlist catalog tracks use ${selected.family}; inferred:catalog-propagation/2026-08-30`,
    genre_estimated: 'true',
    enriched_at: reviewedAt,
  };
}

function groupFamilies(inputRows, keysForRow) {
  const groups = new Map();
  for (const row of inputRows) {
    for (const key of keysForRow(row).filter(Boolean)) {
      const values = groups.get(key) ?? [];
      values.push(row.genre_family);
      groups.set(key, values);
    }
  }
  return groups;
}

function dominantFamily(families) {
  if (!families?.length) return null;
  const counts = new Map();
  for (const family of families) counts.set(family, (counts.get(family) ?? 0) + 1);
  const [family, count] = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return count / families.length >= 0.75 ? { family, count, total: families.length } : null;
}

function normalize(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
