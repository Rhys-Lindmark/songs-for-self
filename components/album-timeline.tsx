'use client';

import { Fragment, memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { AlbumArtwork } from '@/components/album-artwork';
import { observeArtworkVisibility } from '@/lib/artwork-visibility';
import { timelineLeft } from '@/lib/timeline-scale';
import type { ArtworkSource } from '@/lib/album-artwork';

export type AlbumMark = ArtworkSource & { id: string; title: string; artists: string; album: string; genre: string; year: number | null; count: number };
export type AlbumTimeRange = { min: number; max: number; ticks: number[] };
type Viewport = { start: number; end: number; plot: number };

export function AlbumTimeline({ marks, genres, counts, range, label, selectedId, onSelect }: { marks: AlbumMark[]; genres: readonly string[]; counts: Record<string, number>; range: AlbumTimeRange; label: string; selectedId?: string; onSelect: (mark: AlbumMark) => void }) {
  const [classicalExpanded, setClassicalExpanded] = useState(false);
  const historyId = useId();
  const frame = useRef<HTMLElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ start: 0, end: 200, plot: 780 });
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let pending = 0;
    const measure = () => {
      pending = 0;
      const labelWidth = axis.current?.firstElementChild?.getBoundingClientRect().width || 180;
      const next = { start: element.scrollLeft, end: element.scrollLeft + Math.max(0, element.clientWidth - labelWidth), plot: element.scrollWidth - labelWidth };
      setViewport((old) => old.start === next.start && old.end === next.end && old.plot === next.plot ? old : next);
    };
    const queue = () => { if (!pending) pending = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(queue); resize.observe(element);
    element.addEventListener('scroll', queue, { passive: true }); measure();
    return () => { resize.disconnect(); element.removeEventListener('scroll', queue); if (pending) cancelAnimationFrame(pending); };
  }, []);
  const grouped = useMemo(() => {
    const albums = new Map<string, AlbumMark>();
    for (const mark of marks) {
      const key = `${mark.genre}|${mark.year}|${mark.spotifyAlbumId || (mark.album ? `${mark.album}|${mark.artists}` : mark.id)}`;
      const album = albums.get(key);
      if (album) album.count += mark.count; else albums.set(key, { ...mark });
    }
    return [...albums.values()];
  }, [marks]);
  const classicalHistory = useMemo(() => grouped.filter((mark) => mark.genre === 'Classical' && mark.year !== null && mark.year < 1900).sort((a, b) => a.year! - b.year! || a.id.localeCompare(b.id)), [grouped]);
  const historyRange = useMemo(() => ({ min: classicalHistory.reduce((min, mark) => Math.min(min, mark.year!), 1200), max: 1900, ticks: [1200, 1400, 1600, 1800, 1900] }), [classicalHistory]);
  const historyCount = classicalHistory.reduce((total, mark) => total + mark.count, 0);
  const lanes = useMemo(() => new Map(genres.map((genre) => [genre, grouped.filter((mark) => mark.genre === genre && mark.year !== null && mark.year >= range.min && mark.year <= range.max).sort((a, b) => a.year! - b.year! || a.id.localeCompare(b.id))])), [grouped, genres, range]);
  const virtualize = grouped.length > 200;
  return <>
    <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#17221e]/50 sm:hidden">Swipe through time · select an album</p>
    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <section ref={frame} tabIndex={0} aria-label={label} className="touch-pan-x overflow-x-auto overscroll-x-contain border-y border-[#17221e]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238]">
      <div className="min-w-[960px]">
        <div ref={axis} className="grid grid-cols-[120px_1fr] border-b border-[#17221e]/10 py-4 sm:grid-cols-[180px_1fr]">
          <span className="sticky left-0 z-20 bg-[#f3efe4] pr-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#17221e]/50">Genre</span>
          <div className="relative h-5 font-mono text-[10px] text-[#17221e]/55">{range.ticks.map((year) => <span key={year} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: timelineLeft(year, range) }}>{year}</span>)}</div>
        </div>
        {genres.filter((genre) => counts[genre] > 0).map((genre) => {
          const albums = lanes.get(genre) || [];
          const hasHistory = genre === 'Classical' && classicalHistory.length > 0;
          return <Fragment key={genre}>
            <div className="grid grid-cols-[120px_1fr] border-b border-[#17221e]/10 last:border-b-0 sm:grid-cols-[180px_1fr]">
              <div className="sticky left-0 z-20 flex flex-col justify-center bg-[#f3efe4] py-4 pr-3">
                <h3 className="font-serif text-base leading-tight sm:text-xl">{hasHistory ? <button type="button" aria-expanded={classicalExpanded} aria-controls={historyId} aria-label={`${classicalExpanded ? 'Hide' : 'Show'} Classical before 1900`} onClick={() => setClassicalExpanded(!classicalExpanded)} className="flex min-h-11 items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238]"><ChevronRight aria-hidden="true" className={`size-4 shrink-0 ${classicalExpanded ? 'rotate-90' : ''}`} />Classical</button> : genre}</h3>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#17221e]/45">{counts[genre].toLocaleString()} tracks</p>
                {hasHistory && <p className="mt-1 font-mono text-[9px] text-[#17221e]/55">{historyCount.toLocaleString()} before 1900</p>}
              </div>
              <TimelineLane viewport={viewport} virtualize={virtualize} albums={albums} range={range} selectedId={selectedId} onSelect={onSelect} />
            </div>
            {hasHistory && <section id={historyId} aria-label="Classical before 1900" hidden={!classicalExpanded} className="border-b border-[#17221e]/10">
              <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr]">
                <p className="sticky left-0 z-20 bg-[#f3efe4] py-4 pr-3 font-mono text-[10px] text-[#17221e]/60">Before 1900</p>
                <div className="relative mt-4 h-5 font-mono text-[10px] text-[#17221e]/55">{historyRange.ticks.map((year) => <span key={year} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: timelineLeft(year, historyRange) }}>{year}</span>)}</div>
                <div className="sticky left-0 z-20 bg-[#f3efe4]" />
                {classicalExpanded && <TimelineLane viewport={viewport} albums={classicalHistory} range={historyRange} selectedId={selectedId} onSelect={onSelect} />}
              </div>
            </section>}
          </Fragment>;
        })}
      </div>
    </section>
  </>;
}

const TimelineLane = memo(function TimelineLane({ albums, range, selectedId, onSelect, viewport, virtualize = false }: { albums: AlbumMark[]; range: AlbumTimeRange; selectedId?: string; onSelect: (mark: AlbumMark) => void; viewport: Viewport; virtualize?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!virtualize);
  useEffect(() => {
    if (!virtualize || !frame.current) return;
    return observeArtworkVisibility(frame.current, setVisible, false);
  }, [virtualize]);
  const positioned = useMemo(() => albums.map((mark, index) => ({ mark, index, ratio: (mark.year! - range.min) / (range.max - range.min) })), [albums, range]);
  const shown = !virtualize ? positioned : !visible ? [] : positioned.filter(({ mark, ratio }) => mark.id === selectedId || (ratio * viewport.plot >= viewport.start - 44 && ratio * viewport.plot <= viewport.end + 44));
  return <div ref={frame} className="relative h-28" style={{ contain: 'layout paint' }} data-timeline-lane>
    <i aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-[#17221e]/10" />
    {range.ticks.map((year) => <i key={year} aria-hidden="true" className="absolute h-full w-px bg-[#17221e]/8" style={{ left: timelineLeft(year, range) }} />)}
    {shown.map(({ mark, index }) => <button key={mark.id} type="button" aria-label={`${mark.album || mark.title} — ${mark.artists}, ${mark.genre}, ${mark.year}: ${mark.count} track${mark.count === 1 ? '' : 's'}`} aria-pressed={selectedId === mark.id} title={`${mark.album || mark.title} · ${mark.artists} · ${mark.year}`} onClick={() => onSelect(mark)} className="group pointer-events-none absolute z-[1] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238] hover:z-30" style={{ left: `clamp(22px, ${timelineLeft(mark.year!, range)}, calc(100% - 22px))`, top: 25 + (index % 3) * 30 }}>
      <AlbumArtwork album={mark.album || mark.title} artist={mark.artists} coverUrl={mark.coverUrl} spotifyAlbumId={mark.spotifyAlbumId} spotifyTrackId={mark.spotifyTrackId} className={`pointer-events-auto size-7 border border-[#f3efe4] transition-transform group-hover:scale-150 motion-reduce:transition-none ${selectedId === mark.id ? 'ring-2 ring-[#b45238]' : ''}`} />
    </button>)}
  </div>;
});
