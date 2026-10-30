'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { AlbumArtwork } from '@/components/album-artwork';
import { artworkKey, loadArtworkImage, peekArtworkImage, type ArtworkSource } from '@/lib/album-artwork';
import { pinchTransform } from '@/lib/genre-space-transform';

export type GenreSpacePoint = {
  coverUrl?: string | null;
  id: string; spotifyTrackId?: string | null; title: string; artists: string; spotifyArtistIds: string[]; album: string; spotifyAlbumId: string | null;
  family: string; primary: string; secondary: string; x: number; y: number;
  referenceX?: number; referenceY?: number; referenceGenres?: string[]; referenceMatchCount?: number; referenceConfidence?: string; referenceSource?: string[];
  confidence: string; source: string; method: string; estimated: boolean;
};
type GenreSpaceCluster = { id: string; family: string; label: string; count: number; x: number; y: number };
type GenreSpaceArtist = { id: string; family: string; label: string; spotifyArtistId: string | null; count: number; x: number; y: number };
type GenreSpaceFamily = { family: string; x: number; y: number; color: string; count: number };
type GenreSpaceAlbum = { coverUrl: string; coverSource: string; coverSourceId: string };
export type GenreSpacePayload = {
  projection: { name: string; modelVersion: string; method: string; axes: string[]; reproducibleFrom: string[]; referenceName?: string; referenceVersion?: string; referenceUrl?: string; referenceMirrorUrl?: string; referenceMirrorCommit?: string; artistMembershipSource?: string; artistMembershipSourceUpdatedAt?: string };
  summary: { tracks: number; families: number; clusters: number; artists: number; albumCovers: number; referenceGenres?: number; exactReferenceTracks?: number; directLabelTracks?: number; artistMembershipTracks?: number; catalogArtistTracks?: number; familyReferenceFallbackTracks?: number };
  families: GenreSpaceFamily[];
  clusters: GenreSpaceCluster[];
  artists: GenreSpaceArtist[];
  albums: Record<string, GenreSpaceAlbum>;
  points: GenreSpacePoint[];
};
const plotCoordinate = (value: number) => 0.055 + value * 0.89;

export function GenreSpaceMap({ data, query, scopeLabel = 'playlist tracks' }: { data: GenreSpacePayload; query: string; scopeLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const renderedPointsRef = useRef<GenreSpacePoint[]>([]);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; startScale: number; startOffset: { x: number; y: number }; center: { x: number; y: number } } | null>(null);
  const suppressClickRef = useRef(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [activeFamily, setActiveFamily] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [hoveredId, setHoveredId] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePoints = useMemo(() => activeFamily ? data.points.filter((point) => point.family === activeFamily) : data.points, [activeFamily, data.points]);
  const matches = useMemo(() => normalizedQuery ? visiblePoints.filter((point) => `${point.title} ${point.artists} ${point.album} ${point.family} ${point.primary} ${point.secondary}`.toLowerCase().includes(normalizedQuery)) : [], [normalizedQuery, visiblePoints]);
  const selected = visiblePoints.find((point) => point.id === selectedId) ?? visiblePoints.find((point) => point.id === hoveredId) ?? matches[0] ?? null;

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    let cancelled = false;
    let inView = false;
    let repaint = 0;
    const requested = new Set<string>();
    const sourceFor = (point: GenreSpacePoint): ArtworkSource => ({ coverUrl: point.coverUrl || (point.spotifyAlbumId ? data.albums[point.spotifyAlbumId]?.coverUrl : null), spotifyAlbumId: point.spotifyAlbumId, spotifyTrackId: point.spotifyTrackId || point.id });
    const draw = () => {
      const width = Math.max(1, frame.clientWidth);
      const height = Math.max(1, frame.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#f3efe4';
      context.fillRect(0, 0, width, height);
      const familyColors = new Map(data.families.map((family) => [family.family, family.color]));
      const matchIds = normalizedQuery ? new Set(matches.map((point) => point.id)) : null;
      const project = (x: number, y: number) => ({ x: ((plotCoordinate(x) - 0.5) * scale + 0.5 + offset.x) * width, y: ((plotCoordinate(y) - 0.5) * scale + 0.5 + offset.y) * height });

      const size = Math.min(38, Math.max(20, width / 42) * Math.sqrt(scale));
      const occupied = new Set<string>();
      const plotted: GenreSpacePoint[] = [];
      const candidates = selected ? [...visiblePoints.filter((point) => point.id !== selected.id), selected] : visiblePoints;
      for (const point of candidates) {
        const position = project(point.x, point.y);
        if (position.x < -size || position.x > width + size || position.y < -size || position.y > height + size) continue;
        const cell = `${Math.floor(position.x / (size * .8))}|${Math.floor(position.y / (size * .8))}`;
        if (occupied.has(cell) && selected?.id !== point.id) continue;
        occupied.add(cell);
        plotted.push(point);
        const highlighted = !matchIds || matchIds.has(point.id);
        context.globalAlpha = highlighted ? 1 : .12;
        const source = sourceFor(point);
        const image = peekArtworkImage(source);
        if (image) context.drawImage(image, position.x - size / 2, position.y - size / 2, size, size);
        else {
          context.fillStyle = familyColors.get(point.family) ?? '#66706b';
          context.globalAlpha = highlighted ? .3 : .06;
          context.fillRect(position.x - size / 2, position.y - size / 2, size, size);
          context.globalAlpha = highlighted ? .85 : .1;
          context.fillStyle = '#17221e';
          context.font = '10px ui-serif, serif';
          context.textAlign = 'center';
          context.fillText((point.album || point.title).slice(0, 2).toUpperCase(), position.x, position.y + 3);
          const key = artworkKey(source);
          if (inView && key && !requested.has(key) && requested.size < 220) {
            requested.add(key);
            void loadArtworkImage(source).then(() => {
              if (!cancelled && !repaint) repaint = requestAnimationFrame(() => { repaint = 0; draw(); });
            });
          }
        }
        if (selected?.id === point.id) {
          context.globalAlpha = 1;
          context.strokeStyle = '#b45238';
          context.lineWidth = 2;
          context.strokeRect(position.x - size / 2 - 3, position.y - size / 2 - 3, size + 6, size + 6);
        }
      }
      renderedPointsRef.current = plotted;

      context.globalAlpha = 0.82;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const labelBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
      const placeLabel = (label: string, x: number, y: number, color: string) => {
        const halfWidth = context.measureText(label).width / 2 + 4;
        const box = { left: x - halfWidth, right: x + halfWidth, top: y - 7, bottom: y + 7 };
        if (labelBoxes.some((placed) => box.left < placed.right && box.right > placed.left && box.top < placed.bottom && box.bottom > placed.top)) return;
        context.fillStyle = color;
        context.fillText(label, x, y);
        labelBoxes.push(box);
      };
      if (scale < 2.1) {
        context.font = `600 ${Math.max(11, Math.min(17, width / 52))}px ui-monospace, monospace`;
        for (const family of data.families.filter((family) => !activeFamily || family.family === activeFamily)) {
          const position = project(family.x, family.y);
          placeLabel(family.family, position.x, position.y, '#17221e');
        }
      } else {
        context.font = '500 10px ui-monospace, monospace';
        for (const cluster of data.clusters.filter((cluster) => (!activeFamily || cluster.family === activeFamily) && cluster.count >= Math.max(3, 16 / scale)).slice(0, 240)) {
          const position = project(cluster.x, cluster.y);
          if (position.x < 30 || position.x > width - 30 || position.y < 12 || position.y > height - 12) continue;
          placeLabel(`${cluster.label} · ${cluster.count}`, position.x, position.y, '#17221e');
        }
        if (scale >= 4) {
          context.font = '600 11px ui-sans-serif, sans-serif';
          for (const artist of data.artists.filter((artist) => (!activeFamily || artist.family === activeFamily) && artist.count >= Math.max(3, 12 / scale)).slice(0, 120)) {
            const position = project(artist.x, artist.y);
            if (position.x < 40 || position.x > width - 40 || position.y < 14 || position.y > height - 14) continue;
            placeLabel(`${artist.label} · ${artist.count}`, position.x, position.y, '#b45238');
          }
        }
      }
      context.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) draw(); }, { rootMargin: '80px' });
    visibility.observe(frame);
    return () => { cancelled = true; observer.disconnect(); visibility.disconnect(); cancelAnimationFrame(repaint); };
  }, [activeFamily, data, matches, normalizedQuery, offset, scale, selected, visiblePoints]);

  function zoomBy(multiplier: number) {
    setScale((value) => {
      const next = Math.max(1, Math.min(8, value * multiplier));
      const familyFocus = data.families.find((family) => family.family === activeFamily);
      const focus = selected ?? familyFocus ?? { x: 0.5, y: 0.5 };
      const focusX = plotCoordinate(focus.x);
      const focusY = plotCoordinate(focus.y);
      setOffset((current) => ({ x: current.x - (focusX - 0.5) * (next - value), y: current.y - (focusY - 0.5) * (next - value) }));
      return next;
    });
  }
  function reset() { setScale(1); setOffset({ x: 0, y: 0 }); }
  function startPan(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const frame = frameRef.current;
      const [first, second] = [...pointersRef.current.values()];
      if (frame) {
        const bounds = frame.getBoundingClientRect();
        pinchRef.current = {
          distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
          startScale: scale,
          startOffset: offset,
          center: { x: ((first.x + second.x) / 2 - bounds.left) / bounds.width, y: ((first.y + second.y) / 2 - bounds.top) / bounds.height },
        };
      }
      dragRef.current = null;
      suppressClickRef.current = true;
      return;
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }
  function movePan(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (pointersRef.current.size === 2 && pinchRef.current && frame) {
      const [first, second] = [...pointersRef.current.values()];
      const pinch = pinchRef.current;
      const transformed = pinchTransform({ startScale: pinch.startScale, startOffset: pinch.startOffset, center: pinch.center, startDistance: pinch.distance, distance: Math.hypot(second.x - first.x, second.y - first.y) });
      setScale(transformed.scale);
      setOffset(transformed.offset);
      suppressClickRef.current = true;
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId || !frame) {
      if (event.pointerType === 'mouse') setHoveredId(nearestAt(event.clientX, event.clientY, 12)?.id ?? '');
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 2) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setOffset((value) => ({ x: value.x + dx / frame.clientWidth, y: value.y + dy / frame.clientHeight }));
  }
  function endPan(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const wasPinching = pointersRef.current.size > 1 || Boolean(pinchRef.current);
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (wasPinching) suppressClickRef.current = true;
    else if (drag?.pointerId === event.pointerId) suppressClickRef.current = drag.moved;
    pinchRef.current = null;
    const remaining = [...pointersRef.current.entries()][0];
    dragRef.current = remaining ? { pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y, moved: true } : null;
  }
  function nearestAt(clientX: number, clientY: number, maxDistance: number) {
    const frame = frameRef.current;
    if (!frame) return null;
    const bounds = frame.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    let nearest: GenreSpacePoint | null = null;
    let distance = Infinity;
    for (const point of renderedPointsRef.current.filter((point) => !normalizedQuery || matches.includes(point))) {
      const px = (plotCoordinate(point.x) - 0.5) * scale + 0.5 + offset.x;
      const py = (plotCoordinate(point.y) - 0.5) * scale + 0.5 + offset.y;
      const candidate = Math.hypot((px - x) * bounds.width, (py - y) * bounds.height);
      if (candidate < distance) { nearest = point; distance = candidate; }
    }
    return nearest && distance <= maxDistance ? nearest : null;
  }
  function selectNearest(clientX: number, clientY: number) {
    const nearest = nearestAt(clientX, clientY, 18);
    if (nearest) setSelectedId(nearest.id);
  }
  function moveSelection(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (event.key === 'Home') {
      const first = (normalizedQuery ? matches : visiblePoints)[0];
      if (first) setSelectedId(first.id);
      event.preventDefault();
      return;
    }
    const direction = directions[event.key];
    if (!direction) return;
    const candidates = normalizedQuery ? matches : visiblePoints;
    const current = candidates.find((point) => point.id === selected?.id) ?? candidates[0];
    if (!current) return;
    const [dx, dy] = direction;
    const next = candidates.filter((point) => point.id !== current.id).map((point) => {
      const deltaX = point.x - current.x;
      const deltaY = point.y - current.y;
      const forward = deltaX * dx + deltaY * dy;
      const cross = Math.abs(deltaX * dy - deltaY * dx);
      return { point, forward, score: forward + cross * 2.5 };
    }).filter((candidate) => candidate.forward > 0).sort((left, right) => left.score - right.score)[0]?.point;
    if (next) setSelectedId(next.id);
    event.preventDefault();
  }

  return <>
    <div aria-label="Filter genre-space map by family" className="mb-3 flex touch-pan-x gap-2 overflow-x-auto pb-1">
      <button aria-pressed={!activeFamily} onClick={() => { setActiveFamily(''); setSelectedId(''); reset(); }} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-medium ${!activeFamily ? 'border-[#17221e] bg-[#17221e] text-[#f3efe4]' : 'border-[#17221e]/20'}`}>All · {data.summary.tracks.toLocaleString()}</button>
      {data.families.map((family) => <button key={family.family} aria-pressed={activeFamily === family.family} onClick={() => { setActiveFamily(family.family); setSelectedId(''); reset(); }} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-medium ${activeFamily === family.family ? 'border-transparent text-white' : 'border-[#17221e]/20'}`} style={activeFamily === family.family ? { background: family.color } : undefined}>{family.family} · {family.count.toLocaleString()}</button>)}
    </div>
    <div className="grid overflow-clip border border-[#17221e]/20 bg-[#f3efe4] lg:grid-cols-[minmax(0,1fr)_300px]">
    <div ref={frameRef} className="relative min-h-[440px] min-w-0 touch-none border-b border-[#17221e]/15 lg:min-h-[620px] lg:border-b-0 lg:border-r">
      <canvas ref={canvasRef} tabIndex={0} aria-label={`Genre-space map with ${visiblePoints.length.toLocaleString()} ${scopeLabel}. Use arrow keys to move between songs and Home to select the first visible song.`} className="absolute inset-0 h-full w-full cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b45238] active:cursor-grabbing" onClick={(event) => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } selectNearest(event.clientX, event.clientY); }} onKeyDown={moveSelection} onPointerDown={startPan} onPointerMove={movePan} onPointerLeave={() => setHoveredId('')} onPointerUp={endPan} onPointerCancel={endPan} onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.18 : 0.85); }} />
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-[#f3efe4]/92 p-1 shadow-sm">
        <button onClick={() => zoomBy(1.5)} className="grid size-11 place-items-center rounded-full hover:bg-[#17221e]/8"><span className="sr-only">Zoom in</span><Plus className="size-4" /></button>
        <button onClick={() => zoomBy(0.67)} className="grid size-11 place-items-center rounded-full hover:bg-[#17221e]/8"><span className="sr-only">Zoom out</span><Minus className="size-4" /></button>
        <button onClick={reset} className="grid size-11 place-items-center rounded-full hover:bg-[#17221e]/8"><span className="sr-only">Reset genre-space view</span><LocateFixed className="size-4" /></button>
        <span className="pr-3 font-mono text-[9px] uppercase tracking-[0.1em]">{scale.toFixed(1)}×</span>
      </div>
      <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-[#f3efe4]/92 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#17221e]/65 sm:left-auto sm:max-w-md">Drag to pan · wheel or pinch to zoom · {scale < 2.1 ? 'families' : scale < 4 ? 'detailed genres' : 'artists'} · select a cover</div>
    </div>
    <aside aria-label="Selected genre-space track" className="flex min-h-64 min-w-0 flex-col p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a64831]">{normalizedQuery ? `${matches.length.toLocaleString()} search matches` : `${activeFamily || 'All families'} · ${visiblePoints.length.toLocaleString()} tracks`}</p>
      {selected ? <div className="mt-3">
        <div className="mb-4"><AlbumArtwork album={selected.album || selected.title} artist={selected.artists} coverUrl={selected.coverUrl || (selected.spotifyAlbumId ? data.albums[selected.spotifyAlbumId]?.coverUrl : null)} spotifyAlbumId={selected.spotifyAlbumId} spotifyTrackId={selected.spotifyTrackId || selected.id} className="w-full max-w-60" /></div>
        <h3 className="font-serif text-3xl leading-tight">{selected.title}</h3>
        <p className="mt-1 text-sm text-[#17221e]/65">{selected.artists}</p>
        {selected.album && <p className="mt-1 text-xs text-[#17221e]/50">{selected.album}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full px-3 py-1 text-xs text-white" style={{ background: data.families.find((family) => family.family === selected.family)?.color }}>{selected.family}</span><span className="rounded-full border border-[#17221e]/15 px-3 py-1 text-xs">{selected.primary}</span></div>
        {selected.referenceGenres && selected.referenceGenres.length > 0 && <p className="mt-4 text-xs leading-relaxed text-[#17221e]/60">Every Noise reference · {selected.referenceGenres.join(' + ')}</p>}
        <p className="mt-2 text-xs leading-relaxed text-[#17221e]/55">{selected.confidence} genre confidence · {referenceMethodLabel(selected.method)}</p>
        <p className="mt-2 break-words font-mono text-[9px] leading-relaxed uppercase tracking-[0.06em] text-[#17221e]/45">Genre source · {selected.source}</p>
        {(selected.spotifyTrackId || /^[A-Za-z0-9]{22}$/.test(selected.id)) && <a href={`https://open.spotify.com/track/${selected.spotifyTrackId ?? selected.id}`} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#17221e]/20 px-4 text-xs font-medium">Open track in Spotify</a>}
      </div> : <p className="mt-3 text-sm text-[#17221e]/60">Select a cover to inspect a track, or search above for an artist, album, song, family, or detailed genre.</p>}
      {normalizedQuery && <div className="mt-6 border-t border-[#17221e]/15 pt-4"><p className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#17221e]/45">Top matches</p><ul className="grid gap-1">{matches.slice(0, 8).map((point) => <li key={point.id}><button onClick={() => setSelectedId(point.id)} className="min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-[#17221e]/6"><strong className="block truncate font-medium">{point.title}</strong><span className="block truncate text-[#17221e]/50">{point.artists} · {point.primary}</span></button></li>)}</ul></div>}
      <p className="mt-auto pt-6 font-mono text-[9px] leading-relaxed uppercase tracking-[0.08em] text-[#17221e]/45">Left → right: denser / atmospheric → spikier / bouncier. Top → bottom: mechanical / electric → organic. Reference: Every Noise at Once, 2023-12-04.</p>
    </aside>
    </div>
  </>;
}

function referenceMethodLabel(method: string) {
  if (method.includes('catalog-artist')) return 'MusicBrainz / Wikidata artist-genre reference placement';
  if (method.includes('artist-membership')) return 'artist-membership reference placement';
  if (method.includes('family')) return 'family reference fallback';
  return 'direct-label reference placement';
}
