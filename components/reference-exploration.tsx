'use client';
import { useState } from 'react';
import summary from '@/data/reference-exploration.json';
import { PlaylistGenreProfile } from '@/components/playlist-genre-profile';
import { ReferenceExplorationDetails } from '@/components/reference-exploration-details';
import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
const emptyTracks: AnalyzedTrack[] = [];

export function ReferenceExploration() {
  const [panel, setPanel] = useState<'music' | 'albums' | null>(null);
  return <section aria-label="Songs for Self exploration" className="px-4 py-6 sm:px-5 md:px-10">
    <h2 className="font-serif text-2xl sm:text-3xl">Your music exploration</h2>
    <p className="mt-2 text-sm text-[#17221e]/60">{summary.name} · {summary.tracks.toLocaleString()} tracks. <a href="#your-playlist" className="inline-flex min-h-11 items-center underline underline-offset-2">Analyze another playlist or history</a></p>
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div aria-label="Collection music coverage summary" className="border-y border-[#17221e]/15 py-4">
        <h3 className="text-sm">Music map explored</h3><p className="mt-2 font-serif text-3xl sm:text-4xl">{summary.music.percent.toFixed(1)}%</p>
        <p className="mt-1 text-xs text-[#17221e]/60">{summary.music.covered.toLocaleString()} / {summary.music.total.toLocaleString()} music areas</p>
        <button type="button" aria-expanded={panel === 'music'} onClick={() => setPanel(panel === 'music' ? null : 'music')} className="mt-2 min-h-11 text-left text-xs underline underline-offset-2">{panel === 'music' ? 'Hide music areas' : 'Explore music areas'}</button>
      </div>
      <div aria-label="Collection acclaimed album summary" className="border-y border-[#17221e]/15 py-4">
        <h3 className="text-sm">Critically acclaimed albums</h3><p className="mt-2 font-serif text-3xl sm:text-4xl">{summary.albums.covered} / {summary.albums.total}</p>
        <p className="mt-1 text-xs text-[#17221e]/60">One matching song covers an album.</p>
        <button type="button" aria-expanded={panel === 'albums'} onClick={() => setPanel(panel === 'albums' ? null : 'albums')} className="mt-2 min-h-11 text-left text-xs underline underline-offset-2">{panel === 'albums' ? 'Hide acclaimed albums' : 'Explore 500 albums'}</button>
      </div>
    </div>
    <PlaylistGenreProfile tracks={emptyTracks} precomputed={summary.profile} />
    {panel && <ReferenceExplorationDetails panel={panel} />}
  </section>;
}
