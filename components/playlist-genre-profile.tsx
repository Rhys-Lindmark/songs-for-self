'use client';

import { useMemo, useState } from 'react';
import { buildGenreProfile, type GenreListeningBenchmark, type GenreProfile } from '@/lib/genre-profile';
import benchmarkData from '@/data/genre-listening-benchmark.json';
import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
import type { VisitorGenrePlacement } from '@/lib/visitor-genre-space';

const benchmark = benchmarkData as GenreListeningBenchmark;

export function PlaylistGenreProfile({ tracks, placements, precomputed }: { tracks: AnalyzedTrack[]; placements?: VisitorGenrePlacement[]; precomputed?: GenreProfile }) {
  const [detail, setDetail] = useState('broad');
  const [basis, setBasis] = useState('plays');
  const history = tracks.length > 0 && tracks.every((track) => Boolean(track.listening));
  const weighted = history && basis === 'plays';
  const unit = weighted ? 'recorded plays' : history ? 'unique tracks' : 'playlist entries';
  const context = history ? 'your listening history' : 'this playlist';
  const profile = useMemo(() => precomputed ?? buildGenreProfile(tracks, benchmark, placements, weighted ? tracks.map((track) => track.listening!.plays) : undefined), [tracks, placements, weighted, precomputed]);
  const ranked = detail === 'detailed' ? profile.detailed : profile.broad;
  const standout = profile.standout && profile.standout.deltaPoints >= 5 && profile.standout.ratio !== null ? profile.standout : undefined;
  const leader = profile.broad[0];
  return <section aria-label="Playlist genre profile" className="my-5 border-y border-[#17221e]/15 py-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h3 className="font-serif text-xl sm:text-2xl">{ranked.length >= 10 ? 'Your top 10 genres' : 'Your top genres'}</h3>
      <div className="flex flex-wrap items-center gap-3">{history && <label className="text-xs text-[#17221e]/65">Count by<select aria-label="Genre share basis" value={basis} onChange={(event) => setBasis(event.target.value)} className="ml-2 min-h-11 rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="plays">Plays</option><option value="tracks">Unique tracks</option></select></label>}
      <label className="text-xs text-[#17221e]/65">Genre detail<select aria-label="Genre profile detail" value={detail} onChange={(event) => setDetail(event.target.value)} className="ml-2 min-h-11 rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="broad">Broad genres</option><option value="detailed">Detailed genres</option></select></label></div>
    </div>
    {ranked.length ? <ol aria-label="Top playlist genres" className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">{ranked.map((genre, index) => <li key={genre.id} data-profile-genre={genre.id} className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-2 text-sm"><span className="min-w-0 break-words"><span className="mr-1 text-[#17221e]/45">{index + 1}.</span>{genre.label}</span><span className="shrink-0 font-mono text-xs text-[#17221e]/65">{percent(genre.share)}</span></div>
      <div aria-hidden="true" className="mt-1 h-1 bg-[#17221e]/8"><div className="h-full bg-[#346753]" style={{ width: `${genre.share}%` }} /></div>
      <span className="sr-only">{genre.count} of {profile.total} {unit}</span>
    </li>)}</ol> : <p className="mt-4 text-sm">No genres identified yet. Recognizable artists or supplied genre fields can help.</p>}
    <p className="mt-3 text-xs leading-relaxed text-[#17221e]/55">Shares use all {profile.total.toLocaleString()} {unit}.{profile.unclassified > 0 ? ` ${profile.unclassified.toLocaleString()} ${profile.unclassified === 1 ? 'has' : 'have'} no broad genre classification.` : ''}{detail === 'detailed' ? ' Fine tags are used where available; other known rows retain their broad genre.' : ''}</p>
    <div aria-live="polite" className="mt-4">
      {standout ? <p className="text-sm"><strong className="font-medium">{standout.label} stands out in {context}.</strong> {percent(standout.share)} of {weighted ? 'your plays' : 'your tracks'} · approximately {multiple(standout.ratio)} the U.S. streaming share.</p> : leader ? <p className="text-sm"><strong className="font-medium">Top identified genre: {leader.label}.</strong> {leader.count.toLocaleString()} {unit} · {percent(leader.share)} of all {weighted ? 'plays' : 'tracks'}.</p> : null}
    </div>
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Compare your genre mix with U.S. listening</summary>
      <p className="mb-4 text-xs leading-relaxed text-[#17221e]/65">{history ? 'Your selected history' : 'Playlist entries'} versus U.S. on-demand audio streams, FY 2025. This is a listening-mix reference; listener percentiles require histories from other listeners.</p>
      <table aria-label="Playlist shares compared with U.S. streaming shares" className="w-full table-fixed border-collapse text-sm">
        <thead><tr className="border-b border-[#17221e]/20 text-xs text-[#17221e]/60"><th scope="col" className="w-[44%] py-2 text-left font-medium">Comparable group</th><th scope="col" className="w-[28%] px-1 py-2 text-right font-medium">{history ? 'Your history' : 'Your playlist'}</th><th scope="col" className="w-[28%] py-2 text-right font-medium">U.S. streams</th></tr></thead>
        <tbody>{profile.comparisons.map((genre) => <tr key={genre.id} data-benchmark-genre={genre.id} className="border-b border-[#17221e]/10">
          <th scope="row" className="break-words py-3 pr-3 text-left font-normal">{genre.label}{genre.count > 0 && genre.ratio !== null && <span className="mt-1 block text-xs text-[#17221e]/55">{multiple(genre.ratio)} benchmark share</span>}</th>
          <td className="px-1 py-3 text-right align-top font-mono text-xs">{percent(genre.share)}<span aria-hidden="true" className="mt-2 block h-1 bg-[#17221e]/8"><span className="block h-full bg-[#346753]" style={{ width: `${genre.share}%` }} /></span></td>
          <td className="py-3 text-right align-top font-mono text-xs">{percent(genre.benchmarkShare)}<span aria-hidden="true" className="mt-2 block h-1 bg-[#17221e]/8"><span className="block h-full bg-[#b45238]" style={{ width: `${genre.benchmarkShare}%` }} /></span></td>
        </tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-[#17221e]/60">{profile.aligned.toLocaleString()} of {profile.total.toLocaleString()} {unit} align with these groups. {profile.unaligned.toLocaleString()} remain outside comparable groups or need more specific genre evidence. The report&apos;s selected groups cover {benchmark.publishedShareTotal}% of U.S. streams; the remaining share stays separate.</p>
      <p className="mt-2 text-xs leading-relaxed text-[#17221e]/60">{weighted ? 'Each recorded music play counts equally, including short positive plays. The selected history may cover different years from the benchmark.' : history ? 'Each unique track counts equally, regardless of how often you played it.' : 'Playlist entries count equally, including repeat entries.'} Streaming shares are weighted by plays. Genre alignment uses an editorial crosswalk; unaligned entries stay in the percentage denominator. A small sample gives a less stable picture.</p>
      <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center text-xs underline underline-offset-2">Luminate · U.S. FY 2025 benchmark</a>
    </details>
  </section>;
}

function percent(value: number) { return value > 0 && value < 0.1 ? '<0.1%' : `${value.toFixed(1)}%`; }
function multiple(value: number | null) { return value === null ? '—' : `${value >= 10 ? Math.round(value) : value.toFixed(1)}×`; }
