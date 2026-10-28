import fs from 'node:fs';
import { stringify } from 'csv-stringify/sync';

const root = new URL('../', import.meta.url);
const queueUrl = new URL('data/genre-singleton-review-queue.json', root);
const jsonUrl = new URL('data/genre-evidence-gap-report.json', root);
const csvUrl = new URL('data/genre-evidence-gap-report.csv', root);
const queue = JSON.parse(fs.readFileSync(queueUrl, 'utf8'));

function tierFor(item) {
  if (!item.track || item.artists.some((artist) => artist === 'Unknown artist')) {
    return ['identity-missing', 'Recover the Spotify title/artist identity or locate a recording identifier before genre research.'];
  }
  if (item.candidateConfidence === 'low' && item.candidateFamily) {
    return ['related-catalog-lead', `Verify the exact recording or release before accepting the ${item.candidateFamily} catalog-neighborhood lead.`];
  }
  if (/conflict/i.test(item.evidenceGap)) {
    return ['catalog-conflict', 'Research the exact track or release; do not resolve the disagreement by artist plurality.'];
  }
  return ['no-authoritative-hit', 'Search the exact release, label/artist catalog, archived genre neighborhood, and specialist references; retain low confidence if only inference remains.'];
}

const items = queue.queue.map((item) => {
  const [evidenceTier, nextAction] = tierFor(item);
  return {
    rank: item.rank,
    spotifyTrackId: item.spotifyTrackId,
    track: item.track,
    artists: item.artists,
    album: item.album,
    evidenceTier,
    candidateFamily: item.candidateFamily,
    candidateConfidence: item.candidateConfidence,
    candidateSignal: item.candidateSignal,
    evidenceGap: item.evidenceGap,
    nextAction,
  };
});

const tierCounts = Object.fromEntries(
  [...new Set(items.map((item) => item.evidenceTier))]
    .sort((left, right) => left.localeCompare(right))
    .map((tier) => [tier, items.filter((item) => item.evidenceTier === tier).length]),
);
const report = {
  version: '1.0.0',
  generatedFrom: 'data/genre-singleton-review-queue.json',
  unresolvedTracks: items.length,
  method: 'Non-mutating research triage. Tiers describe the strongest remaining lead and never assign a genre.',
  tierCounts,
  items,
};

fs.writeFileSync(jsonUrl, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(csvUrl, stringify(items.map((item) => ({
  rank: item.rank,
  spotify_track_id: item.spotifyTrackId,
  track: item.track,
  artists: item.artists.join('; '),
  album: item.album,
  evidence_tier: item.evidenceTier,
  candidate_family: item.candidateFamily ?? '',
  candidate_confidence: item.candidateConfidence,
  evidence_gap: item.evidenceGap,
  next_action: item.nextAction,
})), { header: true }));

console.log(JSON.stringify({ json: jsonUrl.pathname, csv: csvUrl.pathname, unresolvedTracks: items.length, tierCounts }, null, 2));
