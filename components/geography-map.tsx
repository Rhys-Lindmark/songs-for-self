'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, Globe2, Minus, Plus, RotateCcw } from 'lucide-react';
import { focusMapView, geographyDotRadius, WORLD_VIEW, zoomMapView, type MapView } from '@/lib/geography-map-transform';

export type GeoArtist = {
  id: string;
  name: string;
  count: number;
  spotifyUrl: string | null;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageSource: string | null;
};

export type GeoUnit = {
  id: string;
  label: string;
  unit: string;
  country: string;
  x: number | null;
  y: number | null;
  count: number;
  sourcedCount: number;
  estimatedCount: number;
  years: Record<string, number>;
  artists: string[];
  topArtists: GeoArtist[];
  children: GeoUnit[];
};

export type GeographyPayload = { worldPath: string; placeCount: number; countries: GeoUnit[] };

export function GeographyMap({ data, query }: { data: GeographyPayload; query: string }) {
  const normalizedQuery = query.trim().toLowerCase();
  const countries = useMemo(() => data.countries.filter((country) => !normalizedQuery || `${country.label} ${country.artists.join(' ')}`.toLowerCase().includes(normalizedQuery)), [data.countries, normalizedQuery]);
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(countries[0]?.id ?? '');
  const [view, setView] = useState<MapView>(WORLD_VIEW);
  const dragRef = useRef<{ x: number; y: number; view: MapView } | null>(null);
  const focusedUnits = resolveFocusPath(data.countries, focusPath);
  const focusedUnit = focusedUnits.at(-1) ?? null;
  const focusedCountry = focusedUnits[0] ?? null;
  const visibleUnits = focusedUnit?.children ?? countries;
  const selectedUnit = visibleUnits.find((unit) => unit.id === selectedId) ?? visibleUnits[0] ?? null;
  const maxCount = Math.max(1, ...visibleUnits.map((unit) => unit.count));

  function focusInto(unit: GeoUnit) {
    if (!unit.children.length) return;
    setFocusPath((current) => [...current, unit.id]);
    setSelectedId(unit.children[0]?.id ?? unit.id);
    setView(focusMapView(unit.children, { x: unit.x ?? 500, y: unit.y ?? 250 }));
  }

  function goBack() {
    const nextPath = focusPath.slice(0, -1);
    const nextFocused = resolveFocusPath(data.countries, nextPath).at(-1) ?? null;
    const nextVisible = nextFocused?.children ?? data.countries;
    setFocusPath(nextPath);
    setSelectedId(focusedUnit?.id ?? nextVisible[0]?.id ?? '');
    setView(nextFocused ? focusMapView(nextVisible, { x: nextFocused.x ?? 500, y: nextFocused.y ?? 250 }) : WORLD_VIEW);
  }

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, view };
  }

  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - dragRef.current.x) * 1000 / bounds.width / dragRef.current.view.scale;
    const dy = (event.clientY - dragRef.current.y) * 500 / bounds.height / dragRef.current.view.scale;
    setView({ ...dragRef.current.view, centerX: dragRef.current.view.centerX - dx, centerY: dragRef.current.view.centerY - dy });
  }

  const transform = `translate(500 250) scale(${view.scale}) translate(${-view.centerX} ${-view.centerY})`;

  return <>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a64831]">{data.countries.length.toLocaleString()} countries · {data.placeCount.toLocaleString()} local origins</p>
        <h2 className="mt-2 font-serif text-[2rem] leading-[.95] tracking-tight sm:text-4xl md:text-5xl">A map of your music.</h2>
        <p className="mt-3 text-sm text-[#17221e]/60">{focusedUnit ? `${focusedUnits.map((unit) => unit.label).join(' · ')} · ${visibleUnitLabel(focusedUnit)}` : 'Select a country, then zoom into the artists and places inside it.'}</p>
      </div>
      {focusedUnit && <button onClick={goBack} className="inline-flex min-h-11 items-center gap-1 self-start rounded-full border border-[#17221e]/20 px-4 text-xs font-medium"><ChevronLeft className="size-4" /> {focusPath.length === 1 ? 'All countries' : focusedUnits.at(-2)?.label}</button>}
    </div>

    <div className="grid overflow-hidden border border-[#17221e]/20 bg-[#dfe8dd] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative min-h-[330px] overflow-hidden border-b border-[#17221e]/15 sm:min-h-[480px] lg:border-b-0 lg:border-r">
        {/* SVG has no HTML tag equivalent for an interactive named group. */}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <svg viewBox="0 0 1000 500" role="group" aria-label="Zoomable map of playlist artist origins" className="h-full min-h-[330px] w-full touch-none cursor-grab sm:min-h-[480px]" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onWheel={(event) => { event.preventDefault(); setView((current) => zoomMapView(current, event.deltaY < 0 ? 1.18 : 0.85)); }}>
          <g transform={transform}>
            <path d={data.worldPath} fill="#f3efe4" stroke="#17221e" strokeOpacity="0.28" strokeWidth={0.65 / view.scale} />
            {visibleUnits.map((unit) => {
              const radius = geographyDotRadius(unit.count, maxCount, view.scale);
              const label = `${unit.label}: ${unit.count.toLocaleString()} songs`;
              const isSelected = selectedUnit?.id === unit.id;
              // SVG has no HTML button equivalent for a focusable map marker.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              return <circle key={unit.id} cx={unit.x ?? 0} cy={unit.y ?? 0} r={radius} fill="#b45238" fillOpacity={isSelected ? 0.92 : 0.7} stroke={isSelected ? '#17221e' : '#fff8e8'} strokeWidth={(isSelected ? 2.4 : 0.8) / view.scale} tabIndex={0} role="button" aria-label={label} onFocus={() => setSelectedId(unit.id)} onClick={(event) => { event.stopPropagation(); setSelectedId(unit.id); }} onDoubleClick={(event) => { event.stopPropagation(); if (unit.children.length) focusInto(unit); else setView((current) => ({ centerX: unit.x ?? current.centerX, centerY: unit.y ?? current.centerY, scale: Math.min(8, Math.max(5, current.scale * 1.45)) })); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(unit.id); } }} className="cursor-pointer outline-none focus-visible:stroke-[#17221e]"><title>{label}</title></circle>;
            })}
          </g>
        </svg>
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-[#f3efe4]/92 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em]"><Globe2 className="size-3" /> {focusedUnits.length ? focusedUnits.map((unit) => unit.label).join(' / ') : 'Countries'}</div>
        <div className="absolute bottom-3 left-3 flex gap-2">
          <button aria-label="Zoom in" onClick={() => setView((current) => zoomMapView(current, 1.3))} className="grid size-11 place-items-center rounded-full bg-[#f3efe4] shadow-sm"><Plus className="size-4" /></button>
          <button aria-label="Zoom out" onClick={() => setView((current) => zoomMapView(current, 0.77))} className="grid size-11 place-items-center rounded-full bg-[#f3efe4] shadow-sm"><Minus className="size-4" /></button>
          <button aria-label="Reset map view" onClick={() => setView(focusedUnit ? focusMapView(focusedUnit.children, { x: focusedUnit.x ?? 500, y: focusedUnit.y ?? 250 }) : WORLD_VIEW)} className="grid size-11 place-items-center rounded-full bg-[#f3efe4] shadow-sm"><RotateCcw className="size-4" /></button>
        </div>
      </div>

      <aside className="p-5 sm:p-6">
        <label className="mb-5 flex flex-col gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#17221e]/55 lg:hidden">Choose a {focusedUnit ? displayUnit(visibleUnits[0], focusedCountry) : 'country'}
          <select value={selectedUnit?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 font-sans text-sm normal-case tracking-normal text-[#17221e]">{visibleUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.label} · {unit.count.toLocaleString()}</option>)}</select>
        </label>
        {selectedUnit ? <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a64831]">Selected {displayUnit(selectedUnit, focusedCountry)}</p>
          <h3 className="mt-2 font-serif text-3xl">{selectedUnit.label}</h3>
          {focusedUnits.length > 0 && <p className="mt-1 text-xs text-[#17221e]/55">{focusedUnits.map((unit) => unit.label).join(' · ')}</p>}
          <p className="mt-4 font-serif text-2xl">{selectedUnit.count.toLocaleString()} songs</p>
          <ArtistGrid artists={selectedUnit.topArtists.slice(0, 4)} />
          {selectedUnit.children.length > 0 && <button onClick={() => focusInto(selectedUnit)} className="mt-5 min-h-11 w-full rounded-full border border-[#17221e]/20 px-3 text-xs font-medium">Zoom into {selectedUnit.label}</button>}
        </div> : <p className="text-sm text-[#17221e]/60">Select a place to inspect it.</p>}
      </aside>
    </div>

    <details className="mt-4 border-b border-[#17221e]/15 py-3 text-xs text-[#17221e]/60"><summary className="cursor-pointer font-medium text-[#17221e]">Sources &amp; notes</summary><p className="mt-3 max-w-3xl leading-relaxed">Origins are grouped by country in the world view and by the most specific retained local origin after drill-down. U.S. city coordinates are assigned to 2025 Census state boundaries; nationally placed tracks remain in “State not yet known” so every zoom level reconciles to the same total. The selected place contains {selectedUnit?.sourcedCount.toLocaleString() ?? 0} sourced and {selectedUnit?.estimatedCount.toLocaleString() ?? 0} estimated placements. Artist images come from Wikidata and Wikimedia Commons; playlist links open Spotify.</p></details>
  </>;
}

function resolveFocusPath(countries: GeoUnit[], ids: string[]) {
  const resolved: GeoUnit[] = [];
  let units = countries;
  for (const id of ids) {
    const unit = units.find((candidate) => candidate.id === id);
    if (!unit) break;
    resolved.push(unit);
    units = unit.children;
  }
  return resolved;
}

function displayUnit(unit: GeoUnit | undefined | null, country: GeoUnit | null) {
  if (!unit) return 'place';
  if (unit.unit === 'region' && country?.label === 'United States') return 'state';
  if (unit.unit === 'remainder') return 'area';
  return unit.unit;
}

function visibleUnitLabel(unit: GeoUnit) {
  if (unit.label === 'United States') return 'states';
  if (unit.unit === 'region') return 'cities';
  return 'local scenes';
}

function ArtistGrid({ artists }: { artists: GeoArtist[] }) {
  return <div className="mt-5 grid grid-cols-2 gap-3">{artists.map((artist) => {
    const card = <><div className="aspect-square overflow-hidden rounded-sm bg-[#f3efe4]">{artist.imageUrl
      // Images are source-linked Wikimedia thumbnails retained in the generated artifact.
      // oxlint-disable-next-line next/no-img-element
      ? <img src={artist.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      : <span className="grid h-full place-items-center font-serif text-3xl text-[#17221e]/35">{artist.name.charAt(0)}</span>}</div><span className="mt-1.5 block truncate text-xs font-medium" title={artist.name}>{artist.name}</span><span className="block text-[10px] text-[#17221e]/50">{artist.count} songs</span></>;
    return artist.spotifyUrl ? <a key={artist.id} href={artist.spotifyUrl} target="_blank" rel="noreferrer" className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238]" aria-label={`Open ${artist.name} on Spotify; ${artist.count} songs`}>{card}</a> : <div key={artist.id} className="min-w-0">{card}</div>;
  })}</div>;
}
