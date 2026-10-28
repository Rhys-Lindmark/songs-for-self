import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { classifyGenres } from './music-taxonomy.mjs';

const root = process.cwd();
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'public', 'genre-space-data.json'), 'utf8'));
const reviewedDocuments = [
  JSON.parse(fs.readFileSync(path.join(root, 'data', 'every-noise-family-retains-batch-53.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data', 'every-noise-family-retains-batch-54.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data', 'genre-overrides-batch-54.json'), 'utf8')),
];
const reviewedDecisions = new Map(reviewedDocuments.flatMap((document) => Object.entries(document.tracks)));
const review = atlas.points
  .filter((point) => point.method === 'every-noise-artist-membership-centroid')
  .map((point) => {
    const bridgeFamily = classifyGenres(point.referenceGenres).family;
    const reviewed = reviewedDecisions.get(point.id);
    return {
      spotify_track_id: point.id,
      track_name: point.title,
      artist_names: point.artists,
      current_family: point.family,
      artist_membership_candidate_family: bridgeFamily,
      review_status: bridgeFamily === point.family ? 'agree' : reviewed ? `reviewed-${reviewed.action}` : 'disagree',
      reference_genres: point.referenceGenres.join('; '),
      reference_sources: point.referenceSource.join('; '),
      review_note: bridgeFamily === point.family
        ? 'Artist-membership evidence agrees with the current family.'
        : reviewed
          ? `Recording-level review ${reviewed.action === 'retain' ? 'retains' : 'corrects to'} ${point.family}: ${reviewed.rationale}`
        : bridgeFamily === 'World'
          ? 'Manual review required: positive named regional/editorial evidence is still required before any World reassignment.'
          : bridgeFamily === 'Other'
            ? 'Artist genres do not map cleanly through the requested taxonomy; do not auto-apply.'
            : 'Manual recording-level review required; artist membership is a candidate, not automatic track truth.',
    };
  })
  .sort((left, right) => left.review_status.localeCompare(right.review_status) || left.artist_membership_candidate_family.localeCompare(right.artist_membership_candidate_family) || left.artist_names.localeCompare(right.artist_names));

const output = path.join(root, 'data', 'every-noise-family-review.csv');
fs.writeFileSync(output, stringify(review, { header: true }));
console.log(JSON.stringify({ output, artistMembershipTracks: review.length, disagreements: review.filter((row) => row.review_status === 'disagree').length, agreements: review.filter((row) => row.review_status === 'agree').length, reviewedRetains: review.filter((row) => row.review_status === 'reviewed-retain').length, reviewedCorrections: review.filter((row) => row.review_status === 'reviewed-correct').length }));
