'use client';

import { useEffect, useMemo, useState } from 'react';
import { Headphones, Map, Music2, Search, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaylistUploadAnalyzer } from '@/components/playlist-upload-analyzer';
import { PublicAssetDownload } from '@/components/public-asset-download';
import { GenreSpaceMap, type GenreSpacePayload } from '@/components/genre-space-map';
import { GeographyMap, type GeographyPayload } from '@/components/geography-map';
import { publicAssetUrl } from '@/lib/public-asset-url';
import { timelineLeft } from '@/lib/timeline-scale';
import summary from '@/data/viz-summary.json';

const genreOrder = ['Classical', 'Experimental', 'Country', 'Electronic', 'Modern Folk', 'Hip-hop', 'Jazz', 'Pop', 'R&B, Soul & Blues', 'Rock', 'World', 'Traditional Folk', 'Other'] as const;
const colors: Record<string, string> = {
  Classical: '#d39a00',
  Experimental: '#8d5f99',
  Country: '#ad712f',
  Jazz: '#d85643',
  Rock: '#6c60dc',
  Electronic: '#168e80',
  'Modern Folk': '#7b8d4a',
  'Hip-hop': '#df7625',
  Pop: '#c53b8d',
  'R&B, Soul & Blues': '#a84c63',
  World: '#548b46',
  'Traditional Folk': '#907b45',
  Other: '#66706b',
};
const timelineRanges = [
  { label: 'All musical time', min: 1200, max: 2026, ticks: [1200, 1400, 1600, 1800, 1900, 2000, 2026] },
  { label: 'Recorded era', min: 1900, max: 2026, ticks: [1900, 1925, 1950, 1975, 2000, 2026] },
];
type TimelineAlbum = {
  name: string;
  artists: string;
  count: number;
  spotifyAlbumId: string | null;
  coverUrl: string | null;
  coverSource: string | null;
  coverSourceId: string | null;
};
type TimelinePoint = {
  genre: string;
  year: number;
  count: number;
  sourcedCount: number;
  estimatedCount: number;
  compositionCount: number;
  tracks: string[];
  albums: TimelineAlbum[];
};
type TimelinePayload = { timeline: TimelinePoint[]; historicalPeriods: { period: string; count: number }[] };
type SelectedTimeline = { point: TimelinePoint };

export default function Home() {
  const [activeTab, setActiveTab] = useState('genre');
  const [timelineData, setTimelineData] = useState<TimelinePayload | null>(null);
  const [geographyData, setGeographyData] = useState<GeographyPayload | null>(null);
  const [genreSpaceData, setGenreSpaceData] = useState<GenreSpacePayload | null>(null);
  const [dataError, setDataError] = useState('');
  const [zoom, setZoom] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedTimeline, setSelectedTimeline] = useState<SelectedTimeline | null>(null);
  const range = timelineRanges[zoom];

  useEffect(() => {
    const controller = new AbortController();
    fetch(publicAssetUrl('timeline-data.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('The timeline could not be loaded.');
        return response.json() as Promise<TimelinePayload>;
      })
      .then(setTimelineData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setDataError(cause instanceof Error ? cause.message : 'The timeline could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (activeTab !== 'map' || geographyData) return;
    const controller = new AbortController();
    fetch(publicAssetUrl('geography-data.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('The geography atlas could not be loaded.');
        return response.json() as Promise<GeographyPayload>;
      })
      .then(setGeographyData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setDataError(cause instanceof Error ? cause.message : 'The geography atlas could not be loaded.');
      });
    return () => controller.abort();
  }, [activeTab, geographyData]);

  useEffect(() => {
    if (activeTab !== 'space' || genreSpaceData) return;
    const controller = new AbortController();
    fetch(publicAssetUrl('genre-space-data.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('The genre-space atlas could not be loaded.');
        return response.json() as Promise<GenreSpacePayload>;
      })
      .then(setGenreSpaceData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setDataError(cause instanceof Error ? cause.message : 'The genre-space atlas could not be loaded.');
      });
    return () => controller.abort();
  }, [activeTab, genreSpaceData]);


  const visibleGenres = useMemo(
    () => genreOrder.filter((genre) => genre.toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const timelineMoments = useMemo(
    () => (timelineData?.timeline ?? []).filter((point) => visibleGenres.includes(point.genre as (typeof genreOrder)[number])).sort((left, right) => right.year - left.year || left.genre.localeCompare(right.genre)),
    [timelineData, visibleGenres],
  );

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#f3efe4] text-[#17221e] focus:outline-none">
      <a href="#your-playlist" className="skip-link">Skip to playlist tools</a>
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[#17221e]/15 px-4 py-2 sm:px-5 md:px-10">
        <a href="https://ai.rhyslindmark.com" className="inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.16em] text-[#17221e]/65 sm:text-[11px] sm:tracking-[0.22em]"><span className="sm:hidden">AI / Rhys</span><span className="hidden sm:inline">ai.rhyslindmark.com</span></a>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <PublicAssetDownload fileName="songs-for-self-v3.csv" className="hidden text-sm font-medium hover:opacity-65 sm:inline">Download V3 CSV</PublicAssetDownload>
          <a href="https://open.spotify.com/playlist/3QNxR8qUDQd8e5KyNsOZgx" className="flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-medium hover:bg-[#17221e]/5 hover:opacity-65 sm:px-3 sm:text-sm"><Headphones className="size-4" /> <span className="hidden min-[350px]:inline">Open playlist</span><span className="min-[350px]:hidden">Spotify</span></a>
        </div>
      </header>

      <section className="border-b border-[#17221e]/15">
        <div className="px-4 py-9 sm:px-5 sm:py-10 md:px-10 md:py-14">
          <p className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#a64831]"><Sparkles className="size-3.5" /> A personal atlas of listening</p>
          <h1 className="max-w-4xl font-serif text-[3rem] leading-[0.84] tracking-[-0.05em] min-[375px]:text-[3.5rem] sm:text-[clamp(3.8rem,8vw,7.8rem)]">Songs<br /><em className="font-normal">for Self</em></h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[#17221e]/70 sm:mt-8 sm:text-base md:text-lg">{summary.activeTracks.toLocaleString()} available songs arranged across musical time, geography, and a zoomable map of musical neighborhoods. The archive preserves {summary.unavailableTracks.toLocaleString()} unavailable playlist positions separately.</p>
        </div>
      </section>

      <PlaylistUploadAnalyzer spotifyClientId={process.env.SPOTIFY_CLIENT_ID ?? process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''} />

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setQuery(''); }} className="gap-0">
        <div className="flex flex-col gap-3 border-b border-[#17221e]/15 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between md:px-10">
          <TabsList className="h-14 w-full rounded-2xl bg-[#17221e]/8 p-1 sm:rounded-full md:w-auto">
            <TabsTrigger value="genre" className="min-h-12 min-w-0 flex-1 rounded-xl px-2 text-[10px] leading-tight data-active:bg-[#17221e] data-active:!text-[#f3efe4] sm:rounded-full sm:text-[11px] md:flex-none md:px-4 md:text-sm"><Music2 className="size-4 shrink-0" /> <span>Genre <span className="hidden min-[360px]:inline">through time</span></span></TabsTrigger>
            <TabsTrigger value="map" className="min-h-12 min-w-0 flex-1 rounded-xl px-2 text-[10px] leading-tight data-active:bg-[#17221e] data-active:!text-[#f3efe4] sm:rounded-full sm:text-[11px] md:flex-none md:px-4 md:text-sm"><Map className="size-4 shrink-0" /> <span>Geography</span></TabsTrigger>
            <TabsTrigger value="space" className="min-h-12 min-w-0 flex-1 rounded-xl px-2 text-[10px] leading-tight data-active:bg-[#17221e] data-active:!text-[#f3efe4] sm:rounded-full sm:text-[11px] md:flex-none md:px-4 md:text-sm"><Sparkles className="size-4 shrink-0" /> <span>Genre <span className="hidden min-[360px]:inline">space</span></span></TabsTrigger>
          </TabsList>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-full border border-[#17221e]/20 bg-white/35 px-4 py-2 focus-within:ring-2 focus-within:ring-[#b45238] md:w-auto">
            <Search className="size-4 opacity-50" />
            <span className="sr-only">Search the active visualization</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeTab === 'space' ? 'Find song, artist, or genre' : activeTab === 'map' ? 'Filter places' : 'Filter genres'} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#17221e]/40 md:w-48 md:flex-none" />
          </label>
        </div>

        <TabsContent value="genre" className="m-0">
          <section className="px-4 py-8 sm:px-5 md:px-10 md:py-10">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a64831]">Real enriched playlist data</p>
                <h2 className="mt-2 font-serif text-[2rem] leading-[.95] tracking-tight sm:text-4xl md:text-5xl">A listening life, in musical time.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#17221e]/60">Every available track is placed in time. Classical works sit near the composer&apos;s active period instead of the modern recording date.</p>
              </div>
              <label className="flex min-h-11 w-full flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#17221e]/60 md:min-w-64 md:w-auto">
                Timeline detail <span className="text-[#17221e]">{range.label}</span>
                <input aria-label="Timeline detail" type="range" min="0" max="1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="accent-[#b45238]" />
              </label>
            </div>

            {!timelineData && !dataError && <output className="mb-6 block text-sm text-[#17221e]/55">Loading the musical timeline…</output>}
            {dataError && <p role="alert" className="mb-6 text-sm text-[#a33826]">{dataError}</p>}
            <div className="mb-6 flex flex-wrap gap-2">
              {(timelineData?.historicalPeriods ?? []).slice(0, 10).map((period) => <span key={period.period} className="rounded-full border border-[#17221e]/15 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#17221e]/60">{period.period} · {period.count}</span>)}
            </div>

            <div className="mb-4 flex justify-end">
              <label className="flex min-w-0 flex-col gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#17221e]/50 sm:w-72">
                Open an exact moment
                <select aria-label="Open a genre and musical year" value={selectedTimeline ? `${selectedTimeline.point.genre}|${selectedTimeline.point.year}` : ''} onChange={(event) => { const point = timelineMoments.find((candidate) => `${candidate.genre}|${candidate.year}` === event.target.value); setSelectedTimeline(point ? { point } : null); }} className="min-h-11 w-full rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 font-sans text-sm normal-case tracking-normal text-[#17221e]">
                  <option value="">Choose genre and year…</option>
                  {timelineMoments.map((point) => <option key={`${point.genre}|${point.year}`} value={`${point.genre}|${point.year}`}>{point.year} · {point.genre} · {point.count} track{point.count === 1 ? '' : 's'}</option>)}
                </select>
              </label>
            </div>

            <p className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-[#17221e]/50 sm:hidden"><span>Genre stays pinned</span><span>Swipe through time →</span></p>
            {/* A focusable overflow region lets keyboard users pan the timeline with arrow keys. */}
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <section tabIndex={0} aria-label="Genre timeline. Swipe or scroll horizontally to move through musical time." className="touch-pan-x overflow-x-auto overscroll-x-contain border-y border-[#17221e]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238]">
              <div className="min-w-[780px] sm:min-w-[900px]">
                <div className="grid grid-cols-[120px_1fr] border-b border-[#17221e]/15 py-3 sm:grid-cols-[180px_1fr]">
                  <span className="sticky left-0 z-20 bg-[#f3efe4] pr-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#17221e]/45 sm:text-[10px] sm:tracking-[0.15em]">Genre family</span>
                  <div className="relative h-4 font-mono text-[10px] text-[#17221e]/45">{range.ticks.map((year) => <span key={year} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: timelineLeft(year, range) }}>{year}</span>)}</div>
                </div>
                {visibleGenres.map((genre) => {
                  const points = (timelineData?.timeline ?? []).filter((point) => point.genre === genre && point.year >= range.min && point.year <= range.max);
                  return <div key={genre} className="grid grid-cols-[120px_1fr] border-b border-[#17221e]/10 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:py-5">
                    <div className="sticky left-0 z-20 bg-[#f3efe4] pr-3">
                      <h3 className="font-serif text-base leading-tight sm:text-xl">{genre}</h3>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#17221e]/45">{summary.genreCounts[genre].toLocaleString()} classified</p>
                    </div>
                    <div className="relative h-20 overflow-hidden rounded-sm bg-[#17221e]/[0.035] sm:h-16">
                      <div className="absolute inset-0">{range.ticks.map((year) => <i key={year} className="absolute h-full w-px bg-[#17221e]/10" style={{ left: timelineLeft(year, range) }} />)}</div>
                      {points.map((point) => {
                        const size = Math.min(26, 6 + Math.sqrt(point.count) * 2.8);
                        const label = `${genre}, ${point.year}: ${point.count} track${point.count === 1 ? '' : 's'}\n${point.tracks.join('\n')}`;
                        return <button key={`${genre}-${point.year}`} aria-label={label} aria-pressed={selectedTimeline?.point.genre === genre && selectedTimeline.point.year === point.year} title={label} onClick={() => setSelectedTimeline({ point })} className="group pointer-events-none absolute top-1/2 z-[1] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17221e]" style={{ left: timelineLeft(point.year, range) }}><span aria-hidden="true" className="pointer-events-auto block rounded-full border border-white/55 shadow-sm transition-transform group-hover:scale-150" style={{ width: size, height: size, background: colors[genre], opacity: 0.84 }} /></button>;
                      })}
                    </div>
                  </div>;
                })}
              </div>
            </section>
            {selectedTimeline && <TimelineDetail selection={selectedTimeline} />}
          </section>
        </TabsContent>

        <TabsContent value="map" className="m-0">
          <section className="px-4 py-8 sm:px-5 md:px-10 md:py-10">
            {!geographyData && !dataError && <output className="mb-5 block text-sm text-[#17221e]/55">Loading the geography atlas…</output>}
            {dataError && <p role="alert" className="mb-6 text-sm text-[#a33826]">{dataError}</p>}
            {geographyData && <GeographyMap data={geographyData} query={query} />}
          </section>
        </TabsContent>

        <TabsContent value="space" className="m-0">
          <section className="px-4 py-8 sm:px-5 md:px-10 md:py-10">
            <div className="mb-6 max-w-3xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a64831]">{(genreSpaceData?.summary.tracks ?? summary.activeTracks).toLocaleString()} songs · {(genreSpaceData?.summary.exactReferenceTracks ?? 0).toLocaleString()} reference-matched · {(genreSpaceData?.summary.clusters ?? 0).toLocaleString()} neighborhoods</p>
              <h2 className="mt-2 font-serif text-[2rem] leading-[.95] tracking-tight sm:text-4xl md:text-5xl">Every song, in genre space.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#17221e]/60">This is the actual December 2023 Every Noise at Once genre topology, not a lookalike. Sourced playlist genres land on their matching reference coordinates; unsupported labels use a visibly documented centroid of real reference genres in the reviewed family. Zoom from families into genres, artists, and individual songs.</p>
              {genreSpaceData && <p className="mt-3 text-xs leading-relaxed text-[#17221e]/50">{genreSpaceData.summary.directLabelTracks?.toLocaleString()} direct label matches · {((genreSpaceData.summary.artistMembershipTracks ?? 0) + (genreSpaceData.summary.catalogArtistTracks ?? 0)).toLocaleString()} artist-evidence matches · {genreSpaceData.summary.familyReferenceFallbackTracks?.toLocaleString()} family reference fallbacks · <a className="underline underline-offset-2" href={genreSpaceData.projection.referenceUrl} target="_blank" rel="noreferrer">original map</a> · <a className="underline underline-offset-2" href={genreSpaceData.projection.referenceMirrorUrl} target="_blank" rel="noreferrer">pinned public mirror</a></p>}
            </div>
            {!genreSpaceData && !dataError && <output className="mb-6 block text-sm text-[#17221e]/55">Loading the genre-space atlas…</output>}
            {dataError && <p role="alert" className="mb-6 text-sm text-[#a33826]">{dataError}</p>}
            {genreSpaceData && <GenreSpaceMap data={genreSpaceData} query={query} />}
          </section>
        </TabsContent>
      </Tabs>
      <SourcesDisclosure />
    </main>
  );
}

function SourcesDisclosure() {
  return <section aria-labelledby="sources-methods-heading" className="border-t border-[#17221e]/15 bg-[#17221e] px-4 py-10 text-[#f3efe4] sm:px-5 md:px-10 md:py-14">
    <div className="mx-auto max-w-6xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#e19a7f]">Documentation</p>
      <h2 id="sources-methods-heading" className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">Sources, methods &amp; privacy</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#f3efe4]/65">The atlas stays simple up top. The evidence, assumptions, and limits live here for anyone who wants to inspect what is behind a point.</p>
      <div className="mt-7 grid border-y border-[#f3efe4]/20 md:grid-cols-3">
        <details className="border-b border-[#f3efe4]/20 md:border-r md:border-b-0">
          <summary className="flex min-h-12 cursor-pointer items-center py-3 pr-4 font-medium">Sources &amp; licenses</summary>
          <div className="pb-5 pr-5 text-xs leading-relaxed text-[#f3efe4]/65">
            <p>Playlist identity comes from the public <a className="underline underline-offset-2" href="https://open.spotify.com/playlist/3QNxR8qUDQd8e5KyNsOZgx" target="_blank" rel="noreferrer">Songs for Self playlist</a>. Dates, work identities, artist genres, and origins use source-addressable records from <a className="underline underline-offset-2" href="https://musicbrainz.org/" target="_blank" rel="noreferrer">MusicBrainz</a> and <a className="underline underline-offset-2" href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata</a>. Album thumbnails come from the <a className="underline underline-offset-2" href="https://coverartarchive.org/" target="_blank" rel="noreferrer">Cover Art Archive</a>.</p>
            <p className="mt-3">Genre-space coordinates are extracted from a commit-pinned public mirror of the December 2023 <a className="underline underline-offset-2" href="https://www.furia.com/everynoise_public/" target="_blank" rel="noreferrer">Every Noise at Once public map</a>. This project republishes factual labels and coordinates—not source HTML or audio previews. Current artist memberships are a separately labeled bridge and never replace the pinned geometry.</p>
          </div>
        </details>
        <details className="border-b border-[#f3efe4]/20 md:border-r md:border-b-0 md:px-5">
          <summary className="flex min-h-12 cursor-pointer items-center py-3 font-medium">Methods &amp; limitations</summary>
          <div className="pb-5 text-xs leading-relaxed text-[#f3efe4]/65">
            <p>All 7,582 available tracks receive explicit genre, musical-year, and artist-origin placements. Exact catalog evidence is preferred; album, artist, or editorial propagation is labeled with method and confidence. Classical pieces use composition-era estimates where a modern recording date would hide the work&apos;s historical moment.</p>
            <p className="mt-3">A top-level genre is a useful editorial summary, not an objective fact. Artist birthplace or formation place is not the same thing as where a recording was made. Family-centroid genre-space fallbacks are named estimates, not measured audio similarity. Downloadable CSV fields preserve those distinctions.</p>
          </div>
        </details>
        <details className="md:pl-5">
          <summary className="flex min-h-12 cursor-pointer items-center py-3 font-medium">Visitor privacy</summary>
          <div className="pb-5 text-xs leading-relaxed text-[#f3efe4]/65">
            <p>CSV analysis runs in your browser. The selected file is read locally, matched against static lookup files, and is not uploaded to a Songs for Self server. The enriched download is generated as a local browser file.</p>
            <p className="mt-3">Spotify import uses explicit authorization through browser-based PKCE and only the two playlist-read scopes. The access token stays in memory while owned or collaborative playlist pages are read, then is discarded. Imported rows use the same local enrichment path; we require separate consent before any server-side storage or public sharing.</p>
          </div>
        </details>
      </div>
      <p className="mt-5 text-[11px] leading-relaxed text-[#f3efe4]/45">Machine-readable provenance is in the <PublicAssetDownload fileName="songs-for-self-v3.csv" className="underline underline-offset-2">V3 dataset</PublicAssetDownload>; model and migration details are versioned with each release.</p>
    </div>
  </section>;
}

function TimelineDetail({ selection }: { selection: SelectedTimeline }) {
  const { point } = selection;
  return <aside className="mt-5 grid border border-[#17221e]/15 bg-white/35 md:grid-cols-[220px_1fr]">
    <div className="border-b border-[#17221e]/15 p-5 md:border-b-0 md:border-r">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a64831]">Musical year</p>
      <h3 className="mt-2 font-serif text-4xl">{point.year}</h3>
      <p className="mt-2 text-sm text-[#17221e]/60">{point.genre} · {point.count.toLocaleString()} track{point.count === 1 ? '' : 's'}</p>
    </div>
    <div className="min-w-0 p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#17221e]/45">Album memories</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{point.albums.map((album) => <AlbumMemory key={`${album.spotifyAlbumId}-${album.name}`} album={album} />)}</div>
      <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.14em] text-[#17221e]/45">Playlist examples</p>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{point.tracks.map((track) => <li key={track} className="border-t border-[#17221e]/10 pt-2">{track}</li>)}</ul>
    </div>
  </aside>;
}

function AlbumMemory({ album }: { album: TimelineAlbum }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [coverUrl, setCoverUrl] = useState(album.coverUrl);

  useEffect(() => {
    if (coverUrl || !album.spotifyAlbumId) return;
    const controller = new AbortController();
    const albumUrl = `https://open.spotify.com/album/${album.spotifyAlbumId}`;
    void fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(albumUrl)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Spotify artwork lookup returned ${response.status}.`);
        return response.json() as Promise<{ thumbnail_url?: string }>;
      })
      .then(({ thumbnail_url: thumbnailUrl }) => {
        if (!thumbnailUrl) throw new Error('Spotify artwork lookup did not return a thumbnail.');
        const imageUrl = new URL(thumbnailUrl);
        const trustedHost = imageUrl.hostname === 'i.scdn.co' || imageUrl.hostname.endsWith('.spotifycdn.com');
        if (imageUrl.protocol !== 'https:' || !trustedHost) throw new Error('Spotify artwork lookup returned an unexpected image host.');
        setCoverUrl(imageUrl.toString());
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setImageFailed(true);
      });
    return () => controller.abort();
  }, [album.spotifyAlbumId, coverUrl]);

  const handleImageError = () => {
    setImageLoaded(false);
    if (coverUrl === album.coverUrl && album.spotifyAlbumId) {
      setCoverUrl(null);
      return;
    }
    setImageFailed(true);
  };

  const content = <>
    <div className="relative aspect-square overflow-hidden rounded-sm border border-[#17221e]/10 bg-[#e7e0d2]">
      {!imageLoaded && <span className="absolute inset-0 grid place-items-center px-3 text-center font-serif text-sm leading-tight text-[#17221e]/50"><span><Music2 aria-hidden="true" className="mx-auto mb-2 size-5" />{album.name}</span></span>}
      {coverUrl && !imageFailed
        // Cover Art Archive and verified Spotify fallback images are remote and lazy.
        // oxlint-disable-next-line next/no-img-element
        ? <img src={coverUrl} alt={`Cover of ${album.name}`} loading="lazy" onLoad={() => setImageLoaded(true)} onError={handleImageError} className={`relative z-[1] h-full w-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} />
        : null}
    </div>
    <span className="mt-2 block truncate text-xs font-medium" title={album.name}>{album.name}</span>
    <span className="mt-0.5 block truncate text-[10px] text-[#17221e]/50" title={album.artists}>{album.artists} · {album.count}</span>
  </>;
  return album.spotifyAlbumId
    ? <a href={`https://open.spotify.com/album/${album.spotifyAlbumId}`} target="_blank" rel="noreferrer" aria-label={`Open ${album.name} by ${album.artists} on Spotify`} className="group min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45238]">{content}</a>
    : <div className="min-w-0">{content}</div>;
}
