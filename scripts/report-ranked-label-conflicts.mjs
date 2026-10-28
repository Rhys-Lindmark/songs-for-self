import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';

const root = process.cwd();
const payload = JSON.parse(fs.readFileSync(path.join(root, 'public', 'genre-space-data.json'), 'utf8'));
const decisionDocument = JSON.parse(fs.readFileSync(path.join(root, 'data', 'ranked-label-conflict-decisions.json'), 'utf8'));
const decidedTrackIds = new Set(Object.keys(decisionDocument.tracks));
const families = [
  ['Hip-hop', /(^|\b)(hip hop|hip-hop|rap|trap|grime|drill)(\b|$)/i],
  ['Country', /(^|\b)(country|rockabilly|outlaw country|bluegrass)(\b|$)/i],
  ['R&B, Soul & Blues', /(^|\b)(rhythm and blues|r&b|neo soul|soul|blues)(\b|$)/i],
  ['Electronic', /(^|\b)(techno|house|electronica|synthpop|electropop|breakcore|chillwave|ebm)(\b|$)/i],
  ['Jazz', /(^|\b)(jazz|bebop|hard bop|free jazz|swing)(\b|$)/i],
  ['Classical', /(^|\b)(classical|baroque|romantic era|opera)(\b|$)/i],
  ['Rock', /(^|\b)(rock|punk|metal|shoegaze|slowcore|krautrock)(\b|$)/i],
  ['Modern Folk', /(^|\b)(folk|contemporary folk|singer-songwriter|folk rock|indie folk)(\b|$)/i],
  ['Pop', /(^|\b)(pop|chanson|adult standards|easy listening)(\b|$)/i],
  ['World', /(^|\b)(world|afrobeat|afropop|highlife|juju|mbalax|qawwali|ra[iï]|soukous|gnawa|indian classical|japanese classical|hawaiian)(\b|$)/i],
  ['Traditional Folk', /(^|\b)(traditional folk|folk traditional|old-time|celtic|bluegrass gospel)(\b|$)/i],
  ['Experimental', /(^|\b)(experimental|avant-garde|musique concr[eè]te|sound art|noise)(\b|$)/i],
];

const candidates = payload.points.flatMap((point) => {
  if (decidedTrackIds.has(point.id)) return [];
  const allSupport = families
    .map(([family, pattern]) => ({ family, labels: point.referenceGenres.filter((label) => pattern.test(label)) }))
    .filter((entry) => entry.labels.length > 0);
  // A crossover label is not a conflict when the canonical family also has
  // direct reference support. This deliberately favors a small, actionable
  // audit queue over speculative automatic reclassification.
  if (allSupport.some((entry) => entry.family === point.family)) return [];
  const support = allSupport
    .filter((entry) => entry.family !== point.family)
    .sort((left, right) => right.labels.length - left.labels.length || left.family.localeCompare(right.family));
  if (!support.length) return [];
  const strongest = support[0];
  const tied = support.filter((entry) => entry.labels.length === strongest.labels.length);
  if (tied.length !== 1) return [];
  return [{
    spotify_track_id: point.id,
    track_name: point.title,
    artist_names: point.artists,
    current_family: point.family,
    candidate_family: strongest.family,
    candidate_labels: strongest.labels.join('; '),
    all_reference_genres: point.referenceGenres.join('; '),
    placement_method: point.method,
    confidence: point.confidence,
    spotify_url: `https://open.spotify.com/track/${point.id}`,
    reference_sources: point.referenceSource.join('; '),
    review_note: 'Candidate only: inspect the exact recording before changing canonical data. Specific labels may describe an influence, featured artist, source work, or crossover rather than the recording family.',
  }];
});

const groupCounts = new Map();
for (const row of candidates) {
  const key = `${row.artist_names}\u0000${row.current_family}\u0000${row.candidate_family}`;
  groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
}

const priorityOrder = { high: 0, medium: 1, low: 2 };
const rows = candidates.map((row) => {
  const key = `${row.artist_names}\u0000${row.current_family}\u0000${row.candidate_family}`;
  const artistCandidateTracks = groupCounts.get(key);
  const reviewPriority = artistCandidateTracks >= 3 && row.confidence === 'high'
    ? 'high'
    : artistCandidateTracks >= 2 || row.confidence === 'high'
      ? 'medium'
      : 'low';
  return {
    review_priority: reviewPriority,
    artist_candidate_tracks: artistCandidateTracks,
    ...row,
  };
}).sort((left, right) => priorityOrder[left.review_priority] - priorityOrder[right.review_priority]
  || right.artist_candidate_tracks - left.artist_candidate_tracks
  || left.candidate_family.localeCompare(right.candidate_family)
  || left.artist_names.localeCompare(right.artist_names)
  || left.track_name.localeCompare(right.track_name));

const output = path.join(root, 'data', 'ranked-label-conflict-review.csv');
fs.writeFileSync(output, stringify(rows, { header: true }));
console.log(JSON.stringify({
  output,
  candidates: rows.length,
  reviewedDecisions: decidedTrackIds.size,
  byPriority: Object.fromEntries(['high', 'medium', 'low'].map((priority) => [priority, rows.filter((row) => row.review_priority === priority).length])),
  byCandidateFamily: Object.fromEntries(families.map(([family]) => [family, rows.filter((row) => row.candidate_family === family).length])),
}));
