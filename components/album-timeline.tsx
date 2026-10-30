'use client';

import { useMemo } from 'react';
import { AlbumArtwork } from '@/components/album-artwork';
import { timelineLeft } from '@/lib/timeline-scale';
import type { ArtworkSource } from '@/lib/album-artwork';

export type AlbumMark = ArtworkSource & { id: string; title: string; artists: string; album: string; genre: string; year: number | null; count: number };
export type AlbumTimeRange = { min: number; max: number; ticks: number[] };

export function AlbumTimeline({ marks, genres, counts, range, label, selectedId, onSelect }: { marks: AlbumMark[]; genres: readonly string[]; counts: Record<string, number>; range: AlbumTimeRange; label: string; selectedId?: string; onSelect: (mark: AlbumMark) => void }) {
  const grouped = useMemo(() => {
    const albums = new Map<string, AlbumMark>();
    for (const mark of marks) {
      const key = `${mark.genre}|${mark.year}|${mark.spotifyAlbumId || (mark.album ? `${mark.album}|${mark.artists}` : mark.id)}`;
      const album = albums.get(key);
      if (album) album.count += mark.count; else albums.set(key, { ...mark });
    }
    return [...albums.values()];
  }, [marks]);
  return <>
    <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#17221e]/50 sm:hidden">Swipe through time · select an album</p>
    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <section tabIndex={0} aria-label={label} className="touch-pan-x overflow-x-auto overscroll-x-contain border-y border-[#17221e]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238]">
      <div className="min-w-[960px]">
        <div className="grid grid-cols-[120px_1fr] border-b border-[#17221e]/10 py-4 sm:grid-cols-[180px_1fr]">
          <span className="sticky left-0 z-20 bg-[#f3efe4] pr-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#17221e]/50">Genre</span>
          <div className="relative h-5 font-mono text-[10px] text-[#17221e]/55">{range.ticks.map((year) => <span key={year} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: timelineLeft(year, range) }}>{year}</span>)}</div>
        </div>
        {genres.filter((genre) => counts[genre] > 0).map((genre) => {
          const albums = grouped.filter((mark) => mark.genre === genre && mark.year !== null && mark.year >= range.min && mark.year <= range.max).sort((a, b) => a.year! - b.year! || a.id.localeCompare(b.id));
          return <div key={genre} className="grid grid-cols-[120px_1fr] border-b border-[#17221e]/10 last:border-b-0 sm:grid-cols-[180px_1fr]">
            <div className="sticky left-0 z-20 flex flex-col justify-center bg-[#f3efe4] py-4 pr-3"><h3 className="font-serif text-base leading-tight sm:text-xl">{genre}</h3><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#17221e]/45">{counts[genre].toLocaleString()} tracks</p></div>
            <div className="relative h-28">
              <i aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-[#17221e]/10" />
              {range.ticks.map((year) => <i key={year} aria-hidden="true" className="absolute h-full w-px bg-[#17221e]/8" style={{ left: timelineLeft(year, range) }} />)}
              {albums.map((mark, index) => <button key={mark.id} type="button" aria-label={`${mark.album || mark.title} — ${mark.artists}, ${mark.genre}, ${mark.year}: ${mark.count} track${mark.count === 1 ? '' : 's'}`} aria-pressed={selectedId === mark.id} title={`${mark.album || mark.title} · ${mark.artists} · ${mark.year}`} onClick={() => onSelect(mark)} className="group pointer-events-none absolute z-[1] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238] hover:z-30" style={{ left: `clamp(22px, ${timelineLeft(mark.year!, range)}, calc(100% - 22px))`, top: 25 + (index % 3) * 30 }}>
                <AlbumArtwork album={mark.album || mark.title} artist={mark.artists} coverUrl={mark.coverUrl} spotifyAlbumId={mark.spotifyAlbumId} spotifyTrackId={mark.spotifyTrackId} className={`pointer-events-auto size-7 border border-[#f3efe4] transition-transform group-hover:scale-150 motion-reduce:transition-none ${selectedId === mark.id ? 'ring-2 ring-[#b45238]' : ''}`} />
              </button>)}
            </div>
          </div>;
        })}
      </div>
    </section>
  </>;
}
