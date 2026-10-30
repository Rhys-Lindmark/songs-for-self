'use client';

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { loadPublicJson } from '@/lib/public-json-cache';
import { publicAssetUrl } from '@/lib/public-asset-url';
import { scoreMusicCoverage, type MusicMapCatalog, type MusicArea } from '@/lib/music-coverage';
import type { AnalyzedTrack, GlobalArtistGenreIndex } from '@/lib/playlist-analyzer';
import type { GenreSpacePayload } from '@/components/genre-space-map';

type MapView = 'albums' | 'time' | 'space' | 'map';
type Sources = { catalog: MusicMapCatalog; artistIndex?: GlobalArtistGenreIndex; atlas?: GenreSpacePayload };

export function MusicCoverage({ tracks, view }: { tracks: AnalyzedTrack[]; view: MapView }) {
  const [sources, setSources] = useState<Sources | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const mapId = useId();
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      loadPublicJson<MusicMapCatalog>('music-map.json'),
      loadPublicJson<GlobalArtistGenreIndex>('artist-genre-index.json'),
      loadPublicJson<GenreSpacePayload>('genre-space-data.json'),
    ]).then(([catalog, artistIndex, atlas]) => {
      if (catalog.status === 'rejected') throw catalog.reason;
      if (!cancelled) setSources({ catalog: catalog.value, artistIndex: artistIndex.status === 'fulfilled' ? artistIndex.value : undefined, atlas: atlas.status === 'fulfilled' ? atlas.value : undefined });
    }).catch(() => { if (!cancelled) setError('The exploration map could not load. Your playlist views are still available.'); });
    return () => { cancelled = true; };
  }, [attempt]);
  const result = useMemo(() => sources ? scoreMusicCoverage(tracks, sources.catalog, sources) : null, [tracks, sources]);
  const matchesByArea = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof result>['matches']>();
    for (const match of result?.matches ?? []) {
      const group = grouped.get(match.areaId) ?? [];
      group.push(match);
      grouped.set(match.areaId, group);
    }
    return grouped;
  }, [result]);
  const groups = useMemo(() => [...new Set((sources?.catalog.areas ?? []).toSorted((a, b) => view === 'time' ? a.startYear - b.startYear : groupFor(a, view).localeCompare(groupFor(b, view))).map((area) => groupFor(area, view)))], [sources, view]);
  const activeGroup = groups.includes(groupFilter) ? groupFilter : '';
  const areas = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (sources?.catalog.areas ?? []).filter((area) => {
      if (activeGroup && groupFor(area, view) !== activeGroup) return false;
      if (filter === 'covered' && !matchesByArea.has(area.id)) return false;
      if (filter === 'uncovered' && matchesByArea.has(area.id)) return false;
      return !needle || `${area.label} ${area.family} ${area.era} ${area.region ?? ''}`.toLocaleLowerCase().includes(needle);
    }).sort((a, b) => view === 'time' ? a.startYear - b.startYear || a.label.localeCompare(b.label) : groupFor(a, view).localeCompare(groupFor(b, view)) || a.label.localeCompare(b.label));
  }, [sources, query, filter, matchesByArea, view, activeGroup]);
  const selected = areas.find((area) => area.id === selectedId) ?? areas.find((area) => matchesByArea.has(area.id)) ?? areas[0];
  const selectedMatches = selected ? matchesByArea.get(selected.id) ?? [] : [];
  const grouping = view === 'time' ? 'era' : view === 'map' ? 'region' : 'genre family';

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>) {
    if (!areas.length) return;
    const columns = window.matchMedia('(min-width: 640px)').matches ? 100 : 40;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns, Home: -areas.length, End: areas.length };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const index = Math.max(0, areas.findIndex((area) => area.id === selected?.id));
    setSelectedId(areas[Math.max(0, Math.min(areas.length - 1, index + offsets[event.key]))].id);
  }

  if (error) return <div className="mt-7 border-y border-[#17221e]/15 py-5"><output className="block text-sm">{error}</output><button type="button" onClick={() => { setError(''); setAttempt(attempt + 1); }} className="mt-2 min-h-11 rounded-full border border-[#17221e]/25 px-4 text-sm">Retry exploration map</button></div>;
  if (!sources || !result) return <output className="mt-7 block text-center text-sm text-[#17221e]/60">Matching your playlist to the exploration map…</output>;
  return <section aria-label="Music map exploration" className="my-7 border-y border-[#17221e]/15 py-6">
    <div className="text-center" aria-live="polite">
      <h3 className="font-serif text-2xl sm:text-3xl">You&apos;ve explored {result.percent.toFixed(1)}% of the music map</h3>
      <p className="mt-2 text-sm text-[#17221e]/65">{result.covered.toLocaleString()} of {result.total.toLocaleString()} areas · {result.matches.length.toLocaleString()} of {tracks.length.toLocaleString()} tracks matched</p>
      <progress aria-label="Music map coverage" value={result.covered} max={result.total} className="mt-3 h-1.5 w-full max-w-sm accent-[#346753]" />
      <p className="mt-2 text-xs text-[#17221e]/50">Map {sources.catalog.version} · coverage estimated from playlist metadata</p>
    </div>
    {(!sources.artistIndex || !sources.atlas) && <p className="mt-3 text-center text-xs text-[#17221e]/65">Some matching metadata is unavailable; this score may be incomplete. <button type="button" onClick={() => setAttempt(attempt + 1)} className="min-h-11 underline underline-offset-2">Retry matching metadata</button></p>}
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Explore covered and missing areas</summary>
      <p className="mb-3 text-xs leading-relaxed text-[#17221e]/60">One pixel per area. Green is covered; pale is still unexplored. Switch Time, Genre space, or Geography above to arrange the same areas by era, genre, or region.</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_180px]">
        <label className="text-xs text-[#17221e]/65">Find a music map area<input aria-label="Find a music map area" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bach, Delta blues, Japanese…" className="mt-1 min-h-11 w-full rounded-md border border-[#17221e]/20 bg-transparent px-3 text-sm" /></label>
        <label className="text-xs text-[#17221e]/65">Show areas<select aria-label="Filter music map coverage" value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="all">All areas</option><option value="covered">Covered</option><option value="uncovered">Unexplored</option></select></label>
        <label className="text-xs text-[#17221e]/65">{grouping === 'era' ? 'Era' : grouping === 'region' ? 'Region' : 'Genre family'}<select aria-label="Filter music map group" value={activeGroup} onChange={(event) => setGroupFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="">All groups</option>{groups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
      </div>
      <p className="mb-2 text-xs text-[#17221e]/60">{areas.length.toLocaleString()} areas arranged by {grouping}</p>
      <button type="button" disabled={!areas.length} aria-label={`Music exploration pixels arranged by ${grouping}. Use arrow keys to select an area, or use the area picker below.`} aria-describedby={`${mapId}-selection`} onKeyDown={moveSelection} onClick={(event) => {
        const id = (event.target as HTMLElement).closest<HTMLElement>('[data-music-area]')?.dataset.musicArea;
        if (id) setSelectedId(id);
      }} className="grid min-h-11 w-full grid-cols-[repeat(40,minmax(0,1fr))] gap-[2px] rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238] sm:grid-cols-[repeat(100,minmax(0,1fr))]">
        {areas.map((area) => <span key={area.id} data-music-area={area.id} data-covered={matchesByArea.has(area.id)} title={`${area.label} · ${area.era} · ${matchesByArea.has(area.id) ? 'Covered' : 'Unexplored'}`} aria-hidden="true" className={`aspect-square min-w-0 ${matchesByArea.has(area.id) ? 'bg-[#346753]' : 'bg-[#d6d1c5]'} ${selected?.id === area.id ? 'relative z-10 outline-2 outline-[#b45238]' : ''}`} />)}
      </button>
      <label className="mt-4 block text-xs text-[#17221e]/65">Explore a music map area<select aria-label="Explore a music map area" value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm">
        {!areas.length && <option value="">No matching areas</option>}
        {areas.map((area) => <option key={area.id} value={area.id}>{matchesByArea.has(area.id) ? 'Covered' : 'Unexplored'} · {area.label} · {area.era}</option>)}
      </select></label>
      <div id={`${mapId}-selection`} aria-live="polite">
        {selected ? <aside aria-label="Selected music map area" className="mt-4 border-t border-[#17221e]/15 pt-4">
          <h4 className="font-serif text-xl">{selected.label}</h4>
          <p className="mt-1 text-xs text-[#17221e]/60">{selected.era} · {selected.family} · {selected.region || 'Region not assigned'}</p>
          <p className="mt-3 text-sm">{selectedMatches.length ? `${selectedMatches.length.toLocaleString()} matching track${selectedMatches.length === 1 ? '' : 's'} in your playlist` : 'No matching tracks in this playlist yet.'}</p>
          {!!selectedMatches.length && <ul className="mt-2 grid gap-3">{selectedMatches.slice(0, 12).map((match) => <li key={match.trackIndex} className="min-w-0 break-words text-sm"><span className="font-medium">{tracks[match.trackIndex].track}</span> · {tracks[match.trackIndex].artist}<span className="mt-1 block text-xs text-[#17221e]/55">{match.method} · {match.confidence} confidence · {match.evidence}</span></li>)}</ul>}
          {selectedMatches.length > 12 && <p className="mt-2 text-xs text-[#17221e]/55">Plus {selectedMatches.length - 12} more matching tracks.</p>}
          <div className="mt-2 flex flex-wrap gap-x-5 text-xs"><a href={`https://open.spotify.com/search/${encodeURIComponent(`${selected.label} ${selected.era}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-2">Find recordings</a>{selected.sourceUrls.slice(0, 2).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-2">Source {index + 1}</a>)}</div>
        </aside> : <p className="mt-4 text-sm">No areas match these filters.</p>}
      </div>
    </details>
    {result.unmatched.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm">{result.unmatched.length.toLocaleString()} {result.unmatched.length === 1 ? 'track needs' : 'tracks need'} more evidence</summary><p className="text-xs leading-relaxed text-[#17221e]/60">These tracks add no coverage yet. A fine genre, composer, original year, or recognizable artist ID/name can help.</p><ul className="mt-3 grid gap-3">{result.unmatched.slice(0, 20).map((item) => <li key={item.trackIndex} className="break-words text-xs"><strong className="font-medium">{tracks[item.trackIndex].track}</strong> · {tracks[item.trackIndex].artist}<span className="block text-[#17221e]/55">{item.reason}</span></li>)}</ul>{result.unmatched.length > 20 && <p className="mt-3 text-xs">Plus {result.unmatched.length - 20} more tracks.</p>}</details>}
    <details className="mt-1"><summary className="min-h-11 cursor-pointer py-3 text-xs text-[#17221e]/60">How this score works</summary><p className="text-xs leading-relaxed text-[#17221e]/65">Coverage of this versioned map, rather than a census of all music. Each area counts equally. One supported track covers one area; duplicates and extra tracks in that area add no points. Artist-based matches are estimates. Broad genre-family or nearby-map guesses earn no credit. Unknown tracks can make your score an underestimate.</p><p className="mt-2 text-xs text-[#17221e]/65">Classical uses composer/work eras; historical recording rules handle known reissues. Geography groups only assigned genre regions; unassigned areas stay explicit. The map and its editorial boundaries can change in a future version.</p><a href={publicAssetUrl('music-map.json')} className="mt-1 inline-flex min-h-11 items-center break-all text-xs underline underline-offset-2">Inspect map {sources.catalog.version}</a></details>
  </section>;
}

function groupFor(area: MusicArea, view: MapView) {
  return view === 'time' ? area.era : view === 'map' ? area.region || 'Region not assigned' : area.family;
}
