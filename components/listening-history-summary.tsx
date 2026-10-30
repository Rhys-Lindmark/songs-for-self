import type { ListeningHistorySummary } from '@/lib/spotify-listening-history';

export function ListeningHistoryOverview({ history }: { history: ListeningHistorySummary }) {
  const date = (value: string) => new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
  return <section aria-label="Listening history summary" className="my-5 border-y border-[#17221e]/15 py-4">
    <h3 className="font-serif text-xl sm:text-2xl">Your listening history</h3>
    <p className="mt-2 text-sm">{history.events.toLocaleString()} recorded plays · {history.uniqueTracks.toLocaleString()} unique tracks · {(history.totalMsPlayed / 3_600_000).toLocaleString('en-US', { maximumFractionDigits: 1 })} hours</p>
    <p className="mt-2 text-xs text-[#17221e]/60">{date(history.firstPlayedAt)} – {date(history.lastPlayedAt)} (UTC) · {history.files} {history.format === 'extended' ? 'extended' : 'standard'} history {history.files === 1 ? 'file' : 'files'}</p>
    <p className="mt-2 text-xs leading-relaxed text-[#17221e]/60">The maps and exploration scores use unique tracks. Genre shares start with recorded plays; switch to unique tracks to compare breadth.</p>
    <details className="mt-1 text-xs leading-relaxed text-[#17221e]/60"><summary className="min-h-11 cursor-pointer py-3">History import details</summary>
      <p>Only the selected files are included. {history.format === 'standard' ? 'Standard history usually covers the past year and lacks album names and track IDs. Request Extended Streaming History for lifetime coverage and better album matching.' : 'An extended export can cover your account’s lifetime; select every music history JSON from the extracted download.'}</p>
      <p className="mt-2">Each positive-duration music record counts as a play, including short skips. Listening hours use the recorded milliseconds. This does not imply a full song or album was heard. Play dates are separate from recording dates on the music timeline.</p>
      <p className="mt-2">{history.duplicates.toLocaleString()} overlapping records removed · {history.skippedNonMusic.toLocaleString()} non-music records excluded · {history.skippedZeroDuration.toLocaleString()} zero-duration records excluded · {history.skippedInvalid.toLocaleString()} invalid records excluded.</p>
      <p className="mt-2">Files are read locally, one at a time. Only aggregated song statistics and the summary are saved in this browser. Account identifiers, IP addresses, devices, and listening locations are discarded. Clear playlist removes the saved analysis. Import a new complete selection to replace this history.</p>
    </details>
  </section>;
}
