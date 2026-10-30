'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlbumArtwork } from '@/components/album-artwork';
import { loadPublicJson } from '@/lib/public-json-cache';
import { publicAssetUrl } from '@/lib/public-asset-url';
import { scoreAcclaimedAlbums, type AcclaimedAlbum, type AcclaimedAlbumCatalog, type AcclaimedAlbumCoverageResult } from '@/lib/acclaimed-albums';
import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
import type { GenreSpacePayload } from '@/components/genre-space-map';

type Sources = { catalog: AcclaimedAlbumCatalog; atlas?: GenreSpacePayload };

export type AcclaimedAlbumsSnapshot = { catalog: AcclaimedAlbumCatalog; result: AcclaimedAlbumCoverageResult };

export function AcclaimedAlbums({ tracks, snapshot, showSummary = true, defaultExpanded = false }: { tracks: AnalyzedTrack[]; snapshot?: AcclaimedAlbumsSnapshot; showSummary?: boolean; defaultExpanded?: boolean }) {
  const [sources, setSources] = useState<Sources | null>(snapshot ? { catalog: snapshot.catalog } : null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [limit, setLimit] = useState(24);
  useEffect(() => {
    if (snapshot) return;
    let cancelled = false;
    Promise.allSettled([
      loadPublicJson<AcclaimedAlbumCatalog>('acclaimed-albums.json'),
      loadPublicJson<GenreSpacePayload>('genre-space-data.json'),
    ]).then(([catalog, atlas]) => {
      if (catalog.status === 'rejected') throw catalog.reason;
      if (!cancelled) setSources({ catalog: catalog.value, atlas: atlas.status === 'fulfilled' ? atlas.value : undefined });
    }).catch(() => { if (!cancelled) setError('The acclaimed-album list could not load. Your other playlist views are still available.'); });
    return () => { cancelled = true; };
  }, [attempt, snapshot]);
  const result = useMemo(() => snapshot?.result ?? (sources ? scoreAcclaimedAlbums(tracks, sources.catalog, sources) : null), [tracks, sources, snapshot]);
  const matchesByAlbum = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof result>['matches']>();
    for (const match of result?.matches ?? []) {
      const group = grouped.get(match.albumId) ?? [];
      group.push(match); grouped.set(match.albumId, group);
    }
    return grouped;
  }, [result]);
  const sourceNames = useMemo(() => [...new Set((sources?.catalog.albums ?? []).flatMap((album) => album.sources.map((source) => source.name)))].sort(), [sources]);
  const albums = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (sources?.catalog.albums ?? []).filter((album) => {
      if (filter === 'covered' && !matchesByAlbum.has(album.id)) return false;
      if (filter === 'missing' && matchesByAlbum.has(album.id)) return false;
      if (sourceFilter && !album.sources.some((source) => source.name === sourceFilter)) return false;
      return !needle || `${album.title} ${album.artist} ${album.year ?? ''}`.toLocaleLowerCase().includes(needle);
    }).sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  }, [sources, query, filter, sourceFilter, matchesByAlbum]);
  const selected = albums.find((album) => album.id === selectedId) ?? albums.find((album) => matchesByAlbum.has(album.id)) ?? albums[0];
  const selectedMatches = selected ? matchesByAlbum.get(selected.id) ?? [] : [];
  function retry() { setError(''); setAttempt(attempt + 1); }
  function artwork(album: AcclaimedAlbum) {
    const matched = matchesByAlbum.get(album.id)?.[0];
    const track = matched ? tracks[matched.trackIndex] : undefined;
    const mbid = album.id.match(/(?:mbid-|^)([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1];
    return { coverUrl: track?.coverUrl || (mbid ? `https://coverartarchive.org/release-group/${mbid}/front-250` : null), spotifyAlbumId: track?.spotifyAlbumId || album.spotifyAlbumIds?.[0] };
  }
  if (error) return <div className="my-7 border-y border-[#17221e]/15 py-5"><output className="block text-sm">{error}</output><button type="button" onClick={retry} className="mt-2 min-h-11 rounded-full border border-[#17221e]/25 px-4 text-sm">Retry acclaimed albums</button></div>;
  if (!sources || !result) return <output className="my-7 block text-center text-sm text-[#17221e]/60">Checking your playlist against the 500-album list…</output>;
  return <section aria-label="Acclaimed album exploration" className="my-5 border-y border-[#17221e]/15 py-4">
    {showSummary && <div className="text-center" aria-live="polite">
      <h3 className="font-serif text-xl sm:text-2xl">You&apos;ve explored {result.covered.toLocaleString()}/{result.total.toLocaleString()} critically acclaimed albums</h3>
      <p className="mt-2 text-sm text-[#17221e]/65">{result.percent.toFixed(1)}% · {result.matches.length.toLocaleString()} matching playlist tracks</p>
      <progress aria-label="Acclaimed album coverage" value={result.covered} max={result.total} className="mt-3 h-1.5 w-full max-w-sm accent-[#346753]" />
      <p className="mt-2 text-xs text-[#17221e]/55">One matching song covers an album once. Counted from songs in your playlist.</p>
    </div>}
    {!snapshot && !sources.atlas && <p className="mt-3 text-center text-xs text-[#17221e]/65">Some reference album metadata is unavailable; matches may be incomplete. <button type="button" onClick={retry} className="min-h-11 underline underline-offset-2">Retry album metadata</button></p>}
    <details open={defaultExpanded} className="mt-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Explore the 500 albums</summary>
      <div className="my-3 grid gap-3 sm:grid-cols-[1fr_160px_200px]">
        <label className="min-w-0 text-xs text-[#17221e]/65">Find an album or artist<input aria-label="Find an acclaimed album or artist" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} placeholder="Abbey Road, Joni Mitchell…" className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-[#17221e]/20 bg-transparent px-3 text-sm" /></label>
        <label className="text-xs text-[#17221e]/65">Show albums<select aria-label="Filter acclaimed album coverage" value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(24); }} className="mt-1 min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="all">All albums</option><option value="covered">In your playlist</option><option value="missing">Missing</option></select></label>
        <label className="text-xs text-[#17221e]/65">Critic or list<select aria-label="Filter acclaimed album source" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setLimit(24); }} className="mt-1 min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="">All sources</option>{sourceNames.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
      </div>
      <p className="mb-3 text-xs text-[#17221e]/60">{albums.length.toLocaleString()} albums match these filters</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {albums.slice(0, limit).map((album) => <button key={album.id} type="button" data-acclaimed-album={album.id} data-covered={matchesByAlbum.has(album.id)} aria-pressed={selected?.id === album.id} aria-label={`${album.title} by ${album.artist} · ${matchesByAlbum.has(album.id) ? 'In your playlist' : 'Missing'}`} onClick={() => setSelectedId(album.id)} className={`flex min-h-20 min-w-0 items-center gap-3 border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238] ${selected?.id === album.id ? 'border-[#b45238]' : 'border-[#17221e]/15'}`}>
          <AlbumArtwork album={album.title} artist={album.artist} {...artwork(album)} className="size-14 shrink-0" />
          <span className="min-w-0"><span className="block break-words text-sm font-medium">{album.title}</span><span className="mt-1 block break-words text-xs text-[#17221e]/60">{album.artist}{album.year ? ` · ${album.year}` : ''}</span><span className={`mt-1 block text-xs ${matchesByAlbum.has(album.id) ? 'text-[#346753]' : 'text-[#17221e]/50'}`}>{matchesByAlbum.has(album.id) ? 'In your playlist' : 'Missing'}</span></span>
        </button>)}
      </div>
      {!albums.length && <p className="py-4 text-sm">No albums match these filters.</p>}
      {albums.length > limit && <button type="button" onClick={() => setLimit(limit + 24)} className="mt-4 min-h-11 rounded-full border border-[#17221e]/25 px-5 text-sm">Show 24 more albums</button>}
      {selected && <aside aria-label="Selected acclaimed album" className="mt-5 border-t border-[#17221e]/15 pt-5">
        <div className="flex items-start gap-4"><AlbumArtwork resolution="full" album={selected.title} artist={selected.artist} {...artwork(selected)} className="size-20 shrink-0" /><div className="min-w-0"><h4 className="break-words font-serif text-xl">{selected.title}</h4><p className="mt-1 break-words text-sm text-[#17221e]/65">{selected.artist}{selected.year ? ` · ${selected.year}` : ''}</p><p className="mt-2 text-sm">{selectedMatches.length ? `${selectedMatches.length.toLocaleString()} matching playlist track${selectedMatches.length === 1 ? '' : 's'}` : 'No qualifying tracks from this album yet.'}</p></div></div>
        {!!selectedMatches.length && <ul className="mt-4 grid gap-3">{selectedMatches.slice(0, 8).map((match) => <li key={match.trackIndex} className="break-words text-sm"><strong className="font-medium">{tracks[match.trackIndex].track}</strong> · {tracks[match.trackIndex].artist}<span className="mt-1 block text-xs text-[#17221e]/55">{match.method} · {match.evidence}</span></li>)}</ul>}
        {selectedMatches.length > 8 && <p className="mt-2 text-xs">Plus {selectedMatches.length - 8} more matching tracks.</p>}
        <ul className="mt-3 grid gap-1">{selected.sources.map((source) => <li key={`${source.name}|${source.url}`} className="text-xs"><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-2">{source.name}</a>{source.detail && <span className="text-[#17221e]/55"> · {source.detail}</span>}</li>)}</ul>
        <a href={`https://open.spotify.com/search/${encodeURIComponent(`${selected.artist} ${selected.title}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-2">Find this album</a>
      </aside>}
    {!!result.unmatched.length && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm">{result.unmatched.length.toLocaleString()} tracks earned no album credit</summary><p className="text-xs leading-relaxed text-[#17221e]/60">Tracks outside this list or without a supported album match remain uncredited.</p><ul className="mt-3 grid gap-3">{result.unmatched.slice(0, 16).map((item) => <li key={item.trackIndex} className="break-words text-xs"><strong className="font-medium">{tracks[item.trackIndex].track}</strong> · {tracks[item.trackIndex].artist}<span className="mt-1 block text-[#17221e]/55">{item.reason}</span></li>)}</ul>{result.unmatched.length > 16 && <p className="mt-3 text-xs">Plus {result.unmatched.length - 16} more tracks.</p>}</details>}
    <details className="mt-1"><summary className="min-h-11 cursor-pointer py-3 text-xs text-[#17221e]/60">How these 500 were selected</summary><p className="text-xs leading-relaxed text-[#17221e]/65">{sources.catalog.description || 'A fixed editorial blend of classic album canon and modern critic selections. Each album retains its source links.'}</p><p className="mt-2 text-xs leading-relaxed text-[#17221e]/65">Album identity uses supported album IDs or album title and artist, including recognized editions. The same song or album appearing repeatedly adds no extra credit. This records playlist representation; listening to a whole album is a separate experience.</p><a href={publicAssetUrl('acclaimed-albums.json')} className="mt-1 inline-flex min-h-11 items-center break-all text-xs underline underline-offset-2">Inspect album list {sources.catalog.version}</a></details>
    </details>
  </section>;
}
