'use client';

import { useMemo, useState } from 'react';
import { AlbumArtwork } from '@/components/album-artwork';
import type { AlbumMark } from '@/components/album-timeline';

export function AlbumCloud({ marks, onSelect }: { marks: AlbumMark[]; onSelect: (mark: AlbumMark) => void }) {
  const [family, setFamily] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(240);
  const families = useMemo(() => [...new Set(marks.map((mark) => mark.genre))].sort(), [marks]);
  const albums = useMemo(() => {
    const unique = new Map<string, AlbumMark>();
    for (const mark of marks) {
      if (family && mark.genre !== family) continue;
      if (query && !`${mark.album} ${mark.title} ${mark.artists} ${mark.genre}`.toLowerCase().includes(query.toLowerCase())) continue;
      const key = mark.spotifyAlbumId || mark.coverUrl || (mark.album ? `${mark.album}|${mark.artists}` : mark.id);
      const existing = unique.get(key);
      if (existing) existing.count += mark.count; else unique.set(key, { ...mark });
    }
    return [...unique.values()].sort((a, b) => hash(a.id) - hash(b.id));
  }, [marks, family, query]);
  return <div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex min-h-11 items-center gap-3 text-xs text-[#17221e]/60"><span>Genre</span><select aria-label="Filter albums by genre" value={family} onChange={(event) => { setFamily(event.target.value); setLimit(240); }} className="min-h-11 rounded-full border border-[#17221e]/20 bg-transparent px-4 text-sm text-[#17221e]"><option value="">All genres</option>{families.map((genre) => <option key={genre}>{genre}</option>)}</select></label>
      <label><span className="sr-only">Find an album or artist</span><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(240); }} placeholder="Find an album or artist" className="min-h-11 w-full rounded-full border border-[#17221e]/20 bg-transparent px-4 text-sm sm:w-64" /></label>
    </div>
    <p className="mb-3 text-xs text-[#17221e]/50" aria-live="polite">{albums.length.toLocaleString()} albums · select a cover</p>
    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <section tabIndex={0} aria-label="Your album collection. Scroll to explore all albums." className="max-h-[680px] min-h-64 overflow-y-auto overflow-x-hidden border-y border-[#17221e]/15 bg-[#f3efe4] px-2 py-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238] sm:px-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-x-5 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(60px,1fr))] sm:gap-x-8 sm:gap-y-8">
        {albums.slice(0, limit).map((mark) => <button key={mark.id} type="button" aria-label={`${mark.album || mark.title} — ${mark.artists}, ${mark.genre}, ${mark.count} track${mark.count === 1 ? '' : 's'}`} title={`${mark.album || mark.title} · ${mark.artists}`} onClick={() => onSelect(mark)} className="group relative grid min-h-11 min-w-11 place-items-center focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238] hover:z-10" style={{ transform: `translate(${(hash(mark.id) % 25) - 12}px, ${(hash(`${mark.id}-y`) % 33) - 16}px)` }}>
          <AlbumArtwork album={mark.album || mark.title} artist={mark.artists} coverUrl={mark.coverUrl} spotifyAlbumId={mark.spotifyAlbumId} spotifyTrackId={mark.spotifyTrackId} className="size-12 border border-[#17221e]/5 transition-transform group-hover:scale-125 motion-reduce:transition-none sm:size-14" />
        </button>)}
      </div>
      {!albums.length && <p className="py-16 text-center text-sm text-[#17221e]/55">No albums match this filter.</p>}
    </section>
    {albums.length > limit && <button type="button" onClick={() => setLimit(limit + 240)} className="mt-3 min-h-11 rounded-full border border-[#17221e]/25 px-4 text-xs">Show 240 more albums</button>}
    <p className="mt-3 text-xs text-[#17221e]/45">Missing artwork is shown with initials.</p>
  </div>;
}

function hash(value: string) { let hash = 0; for (const character of value) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0; return hash; }
