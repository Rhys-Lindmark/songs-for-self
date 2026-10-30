'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Clock3, Download, ExternalLink, FileMusic, LoaderCircle, LockKeyhole, Map, Music2, Sparkles, Trash2, Upload } from 'lucide-react';
import { GenreSpaceMap, type GenreSpacePayload } from '@/components/genre-space-map';
import { PublicAssetDownload } from '@/components/public-asset-download';
import { SpotifyPlaylistImport } from '@/components/spotify-playlist-import';
import { AlbumCloud } from '@/components/album-cloud';
import { MusicCoverage } from '@/components/music-coverage';
import { AcclaimedAlbums } from '@/components/acclaimed-albums';
import { PlaylistGenreProfile } from '@/components/playlist-genre-profile';
import { AlbumTimeline, type AlbumMark } from '@/components/album-timeline';
import { AlbumArtwork } from '@/components/album-artwork';
import { RECORDED_TIMELINE_RANGE } from '@/lib/timeline-scale';
import { aggregatePlaces, analyzePlaylistRows, parseCsv, type AnalyzedTrack, type GlobalArtistGenreIndex, type Lookup } from '@/lib/playlist-analyzer';
import { loadPublicJson } from '@/lib/public-json-cache';
import { enrichedPlaylistFileName, serializeEnrichedPlaylist } from '@/lib/playlist-export';
import { buildVisitorGenreSpace, type VisitorGenreSpaceResult } from '@/lib/visitor-genre-space';
import { SPOTIFY_PENDING_STORAGE_KEY } from '@/lib/spotify-import';
import { parseSpotifyAccountData, type SpotifyAccountPlaylist } from '@/lib/spotify-account-data';
import { clearStoredPlaylistAnalysis, loadStoredPlaylistAnalysis, makeStoredPlaylistAnalysis, saveStoredPlaylistAnalysis, type StoredPlaylistAnalysis } from '@/lib/playlist-analysis-store';

const genreOrder = ['Classical', 'Experimental', 'Country', 'Electronic', 'Modern Folk', 'Hip-hop', 'Jazz', 'Pop', 'R&B, Soul & Blues', 'Rock', 'World', 'Traditional Folk', 'Other'] as const;
type LayerStatus = 'idle' | 'loading' | 'ready' | 'failed';

export function PlaylistUploadAnalyzer({ spotifyClientId = '' }: { spotifyClientId?: string }) {
  const exploreHeading = useRef<HTMLHeadingElement>(null);
  const [fileName, setFileName] = useState('');
  const [tracks, setTracks] = useState<AnalyzedTrack[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [worldPath, setWorldPath] = useState('');
  const [view, setView] = useState<'albums' | 'space' | 'time' | 'map'>('albums');
  const [genreSpace, setGenreSpace] = useState<VisitorGenreSpaceResult | null>(null);
  const [importSession, setImportSession] = useState(0);
  const [accountPlaylists, setAccountPlaylists] = useState<SpotifyAccountPlaylist[]>([]);
  const [accountDataFileName, setAccountDataFileName] = useState('');
  const [resumeSnapshot, setResumeSnapshot] = useState<StoredPlaylistAnalysis | null>(null);
  const [storageStatus, setStorageStatus] = useState<'checking' | 'saved' | 'unavailable' | 'idle'>('checking');
  const [mapStatus, setMapStatus] = useState<LayerStatus>('idle');
  const [spaceStatus, setSpaceStatus] = useState<LayerStatus>('idle');
  const [mapError, setMapError] = useState('');
  const [spaceError, setSpaceError] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumMark | null>(null);
  const albumMarks = useMemo(() => {
    const byTrack = new globalThis.Map((genreSpace?.payload.points ?? []).filter((point) => point.spotifyTrackId).map((point) => [point.spotifyTrackId, point]));
    return tracks.map((track, index): AlbumMark => {
      const point = byTrack.get(track.spotifyTrackId);
      const albumId = track.spotifyAlbumId || point?.spotifyAlbumId;
      return {
        id: `import-${index}`, title: track.track, artists: track.artist, album: track.album || point?.album || '',
        spotifyTrackId: track.spotifyTrackId, spotifyAlbumId: albumId,
        coverUrl: track.coverUrl || point?.coverUrl || (albumId ? genreSpace?.payload.albums[albumId]?.coverUrl : null),
        genre: track.genre, year: track.year, count: 1,
      };
    });
  }, [tracks, genreSpace]);
  const genreCounts = useMemo(() => Object.fromEntries(genreOrder.map((genre) => [genre, tracks.filter((track) => track.genre === genre).length])), [tracks]);
  const places = useMemo(() => aggregatePlaces(tracks), [tracks]);
  const dated = tracks.filter((track) => track.year).length;
  const mapped = tracks.filter((track) => track.x !== null && track.y !== null).length;
  const classified = tracks.filter((track) => track.genre !== 'Other').length;
  const previewSource = fileName.match(/^spotify-preview-[A-Za-z0-9]+-(\d+)-of-(\d+)\.csv$/);

  useEffect(() => {
    if (!tracks.length) return;
    exploreHeading.current?.focus({ preventScroll: true });
    exploreHeading.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [tracks]);

  useEffect(() => {
    let cancelled = false;
    void loadStoredPlaylistAnalysis().then((snapshot) => {
      if (cancelled) return;
      setResumeSnapshot(snapshot);
      setStorageStatus(snapshot ? 'saved' : 'idle');
    }).catch(() => { if (!cancelled) setStorageStatus('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  const loadMapLayer = useCallback(() => {
    setWorldPath('');
    setMapError('');
    setMapStatus('loading');
    void loadPublicJson<{ worldPath: string }>('world-outline.json').then((outline) => {
      setWorldPath(outline.worldPath);
      setMapStatus('ready');
    }).catch((cause: unknown) => {
      setMapStatus('failed');
      setMapError(cause instanceof Error ? cause.message : 'The map layer could not be loaded.');
    });
  }, []);

  const loadGenreSpaceLayer = useCallback((analyzed: AnalyzedTrack[]) => {
    setGenreSpace(null);
    setSpaceError('');
    setSpaceStatus('loading');
    void loadPublicJson<GenreSpacePayload>('genre-space-data.json').then((atlas) => {
      setGenreSpace(buildVisitorGenreSpace(analyzed, atlas));
      setSpaceStatus('ready');
    }).catch((cause: unknown) => {
      setSpaceStatus('failed');
      setSpaceError(cause instanceof Error ? cause.message : 'The deeper genre-space layer could not be loaded.');
    });
  }, []);

  const loadDeepViews = useCallback((analyzed: AnalyzedTrack[]) => {
    loadMapLayer();
    loadGenreSpaceLayer(analyzed);
  }, [loadGenreSpaceLayer, loadMapLayer]);

  const presentAnalysis = useCallback((analyzed: AnalyzedTrack[], sourceName: string) => {
    setFileName(sourceName);
    setTracks(analyzed);
    setView('albums');
    setSelectedAlbum(null);
    setResumeSnapshot(null);
    loadDeepViews(analyzed);
  }, [loadDeepViews]);

  const analyzeRows = useCallback(async (rows: Record<string, string>[], sourceName: string) => {
    setLoading(true);
    setError('');
    setMapStatus('idle');
    setSpaceStatus('idle');
    setMapError('');
    setSpaceError('');
    setWorldPath('');
    setGenreSpace(null);
    setFileName(sourceName);
    try {
      const [lookup, globalGenreIndex] = await Promise.all([
        loadPublicJson<Lookup>('upload-lookup.json'),
        loadPublicJson<GlobalArtistGenreIndex>('artist-genre-index.json'),
      ]);
      if (!rows.length) throw new Error('No playlist tracks were found.');
      const analyzed = analyzePlaylistRows(rows, lookup, globalGenreIndex);
      presentAnalysis(analyzed, sourceName);
      const snapshot = makeStoredPlaylistAnalysis(sourceName, analyzed);
      void saveStoredPlaylistAnalysis(snapshot).then(() => setStorageStatus('saved')).catch(() => setStorageStatus('unavailable'));
    } catch (cause) {
      setTracks([]);
      setGenreSpace(null);
      setMapStatus('idle');
      setSpaceStatus('idle');
      setError(cause instanceof Error ? cause.message : 'That file could not be read.');
    } finally {
      setLoading(false);
    }
  }, [presentAnalysis]);

  function resumeStoredAnalysis() {
    if (!resumeSnapshot) return;
    setError('');
    presentAnalysis(resumeSnapshot.tracks, resumeSnapshot.sourceName);
    setStorageStatus('saved');
  }

  function forgetStoredAnalysis() {
    setResumeSnapshot(null);
    setStorageStatus('idle');
    void clearStoredPlaylistAnalysis().catch(() => setStorageStatus('unavailable'));
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
      try {
        const playlists = parseSpotifyAccountData(await file.text());
        setAccountPlaylists(playlists);
        setAccountDataFileName(file.name);
        setFileName(file.name);
        setTracks([]);
        setGenreSpace(null);
        setError('');
        if (playlists.length === 1) await analyzeRows(playlists[0].rows, `${playlists[0].name}.json`);
      } catch (cause) {
        setAccountPlaylists([]);
        setError(cause instanceof Error ? cause.message : 'That Spotify account-data file could not be read.');
      }
      return;
    }
    setAccountPlaylists([]);
    setAccountDataFileName('');
    const parsed = parseCsv(await file.text());
    await analyzeRows(parsed, file.name);
  }

  function downloadEnrichedPlaylist() {
    if (!tracks.length || !genreSpace) return;
    const url = URL.createObjectURL(new Blob([serializeEnrichedPlaylist(tracks.map((track, index) => ({ ...track, album: albumMarks[index].album, spotifyAlbumId: albumMarks[index].spotifyAlbumId, coverUrl: albumMarks[index].coverUrl })), genreSpace.placements)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = enrichedPlaylistFileName(fileName);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function clearImportedPlaylist() {
    setTracks([]);
    setGenreSpace(null);
    setWorldPath('');
    setFileName('');
    setError('');
    setView('albums');
    setSelectedAlbum(null);
    setMapStatus('idle');
    setSpaceStatus('idle');
    setMapError('');
    setSpaceError('');
    setAccountPlaylists([]);
    setAccountDataFileName('');
    sessionStorage.removeItem(SPOTIFY_PENDING_STORAGE_KEY);
    setResumeSnapshot(null);
    setStorageStatus('idle');
    void clearStoredPlaylistAnalysis().catch(() => setStorageStatus('unavailable'));
    setImportSession((value) => value + 1);
  }

  return <section id="your-playlist" tabIndex={-1} className="border-t border-[#17221e]/15 bg-[#ece6d8] px-4 py-10 outline-none sm:px-5 sm:py-12 md:px-10 md:py-16">
    <div className={tracks.length ? "grid gap-8" : "grid gap-8 lg:grid-cols-[minmax(260px,.65fr)_minmax(0,1.35fr)]"}>
      <details open={!tracks.length}>
        <summary className={tracks.length ? "min-h-11 cursor-pointer py-3 text-sm text-[#17221e]/65" : "hidden"}>Change playlist</summary>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a64831]">Analyze your playlist</p>
        <h2 className="mt-3 max-w-md font-serif text-[2.25rem] leading-[.95] tracking-tight sm:text-4xl md:text-6xl">What does <em className="font-normal">your</em> music look like?</h2>
        <p className="mt-5 max-w-lg text-sm leading-relaxed text-[#17221e]/65">Paste any public Spotify playlist for a quick preview—or copy every track from Spotify Desktop for the complete atlas. CSV and account-data imports work without an account connection.</p>
        <div className="mt-6"><SpotifyPlaylistImport key={importSession} configuredClientId={spotifyClientId} disabled={loading} onRows={analyzeRows} /></div>
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-[#17221e]/55"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" /> <span>CSV and Spotify account-data files stay in this browser and are never uploaded. The finished lightweight analysis is saved locally so a reload can resume it; Clear playlist removes it.</span></p>
        {!tracks.length && resumeSnapshot && <output className="mt-4 block border border-[#17221e]/15 bg-white/30 p-4">
          <p className="font-serif text-xl">Resume your last atlas?</p>
          <p className="mt-1 text-xs leading-relaxed text-[#17221e]/55"><strong className="font-medium text-[#17221e]">{resumeSnapshot.sourceName}</strong> · {resumeSnapshot.tracks.length.toLocaleString()} tracks · saved {new Date(resumeSnapshot.savedAt).toLocaleString()}</p>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={resumeStoredAnalysis} className="min-h-11 rounded-full bg-[#17221e] px-4 text-xs font-medium text-[#f3efe4]">Resume atlas</button><button type="button" onClick={forgetStoredAnalysis} className="min-h-11 rounded-full px-4 text-xs text-[#17221e]/60 underline underline-offset-2">Forget saved analysis</button></div>
        </output>}
        {storageStatus === 'unavailable' && <p className="mt-3 text-xs leading-relaxed text-[#a33826]">This browser is blocking local checkpoint storage. The atlas still works now, but it cannot resume after a reload.</p>}
        <div className="mt-3 grid gap-3 min-[390px]:flex min-[390px]:flex-wrap">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#17221e] px-5 py-3 text-sm font-medium text-[#f3efe4] hover:opacity-85">
            <Upload className="size-4" /> {loading ? 'Analyzing…' : 'Choose CSV or Spotify JSON'}
            <input className="sr-only" type="file" accept=".csv,.json,text/csv,application/json" disabled={loading} onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          <PublicAssetDownload fileName="playlist-upload-template.csv" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#17221e]/25 px-5 py-3 text-sm font-medium hover:bg-white/35">CSV template</PublicAssetDownload>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[#17221e]/45">CSV supports common Track, Artist, Release Date, Genre, Spotify ID, Country, Latitude, and Longitude columns. You can also choose the playlist JSON from Spotify&apos;s official account-data download.</p>
        <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-xs text-[#17221e]/55 underline underline-offset-2">Request or download Spotify account data <ExternalLink className="ml-1 size-3" /></a>
        {accountPlaylists.length > 1 && <div className="mt-4">
          <label htmlFor="spotify-account-playlist" className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#17221e]/50">Choose a playlist from {accountDataFileName}</label>
          <select id="spotify-account-playlist" defaultValue="" onChange={(event) => { const playlist = accountPlaylists[Number(event.target.value)]; if (playlist) void analyzeRows(playlist.rows, `${playlist.name}.json`); }} className="mt-2 min-h-11 w-full rounded-full border border-[#17221e]/20 bg-[#f8f5ed] px-4 text-sm">
            <option value="" disabled>Select one of {accountPlaylists.length.toLocaleString()} playlists</option>
            {accountPlaylists.map((playlist, index) => <option key={`${playlist.name}-${index}`} value={index}>{playlist.name} · {playlist.rows.length.toLocaleString()} tracks</option>)}
          </select>
        </div>}
        <div aria-live="polite">
          {fileName && <p className="mt-5 flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em]"><FileMusic className="size-4 shrink-0 text-[#b45238]" /> <span className="min-w-0 break-all">{fileName}</span></p>}
          {loading && <p className="mt-3 text-sm text-[#17221e]/60">Reading and enriching your playlist in this browser…</p>}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-[#a33826]">{error}</p>}
      </details>

      <div className="min-w-0">
        {!tracks.length ? <div className="grid min-h-64 place-items-center border border-dashed border-[#17221e]/25 bg-white/20 p-5 text-center sm:min-h-80 sm:p-8"><div><FileMusic className="mx-auto size-8 text-[#b45238]" /><p className="mt-4 font-serif text-2xl">Your playlist atlas will appear here.</p><p className="mt-2 text-sm text-[#17221e]/50">Paste a playlist link, copy its tracks from Spotify Desktop, or choose a file.</p></div></div> : <>
          <div className="mb-8 text-center">
            <h2 ref={exploreHeading} tabIndex={-1} className="font-serif text-4xl tracking-tight outline-none sm:text-5xl">Explore your music</h2>
            <p className="mt-3 break-words text-sm text-[#17221e]/55">{tracks.length.toLocaleString()} tracks · {fileName}</p>
            {previewSource && <output className="mt-3 block text-sm text-[#a64831]">Spotify public preview: {Number(previewSource[1]).toLocaleString()} of {Number(previewSource[2]).toLocaleString()} tracks. Use Change playlist to import the complete playlist.</output>}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div aria-label="Choose uploaded playlist visualization" className="grid grid-cols-2 rounded-2xl bg-[#17221e]/8 p-1 sm:flex sm:w-fit sm:rounded-full">
              <UploadViewButton active={view === 'albums'} onClick={() => { setView('albums'); setSelectedAlbum(null); }} icon={<Music2 className="size-4" />} label="Albums" />
              <UploadViewButton active={view === 'time'} onClick={() => setView('time')} icon={<Clock3 className="size-4" />} label="Time" />
              <UploadViewButton active={view === 'space'} onClick={() => setView('space')} icon={<Sparkles className="size-4" />} label="Genre space" />
              <UploadViewButton active={view === 'map'} onClick={() => setView('map')} icon={<Map className="size-4" />} label="Geography" />
            </div>
            <div className="grid gap-2 min-[390px]:flex">
              <button disabled={!genreSpace} onClick={downloadEnrichedPlaylist} title={!genreSpace ? 'Available after the genre-space layer loads' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#17221e]/25 px-4 py-2.5 text-xs font-medium hover:bg-white/35 disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" /> {spaceStatus === 'failed' ? 'Retry genre space to download' : genreSpace ? 'Download enriched CSV' : 'Preparing enriched download…'}</button>
              <button onClick={clearImportedPlaylist} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium text-[#17221e]/60 hover:bg-white/35"><Trash2 className="size-4" /> Clear playlist</button>
            </div>
          </div>
          <PlaylistGenreProfile tracks={tracks} placements={genreSpace?.placements} />
          <MusicCoverage tracks={tracks} view={view} />
          <AcclaimedAlbums tracks={tracks} />
          {view === 'albums' && <div className="mt-7"><AlbumCloud marks={albumMarks} onSelect={setSelectedAlbum} /></div>}
          {view === 'space' && (spaceStatus === 'idle' || spaceStatus === 'loading') && <div className="mt-4 grid min-h-64 place-items-center border border-dashed border-[#17221e]/25 bg-white/20 p-6 text-center"><div><LoaderCircle className="mx-auto size-7 animate-spin text-[#b45238] motion-reduce:animate-none" /><p className="mt-3 text-sm text-[#17221e]/55">Loading the deeper genre-space layer…</p><p className="mt-1 text-xs text-[#17221e]/40">Time and geography stay available while this larger layer loads.</p></div></div>}
          {view === 'space' && spaceStatus === 'failed' && <LayerFailure title="Genre space couldn’t load." detail={spaceError} onRetry={() => loadGenreSpaceLayer(tracks)} />}
          {view === 'space' && genreSpace && genreSpace.payload.points.length > 0 && <div className="mt-4">
            <GenreSpaceMap data={genreSpace.payload} query="" scopeLabel="imported tracks" />
            <p className="mt-3 text-xs leading-relaxed text-[#17221e]/50">{genreSpace.exactTracks} exact song coordinates · {genreSpace.artistCentroids} artist-membership centroids · {genreSpace.familyFallbacks} genre-family fallbacks. Artist and family placements are labeled estimates, not measured track-audio similarity.</p>
          </div>}
          {view === 'space' && genreSpace && genreSpace.payload.points.length === 0 && <div className="mt-4 border border-dashed border-[#17221e]/25 bg-white/20 p-6 text-center"><p className="font-serif text-2xl">No genre-space placements yet.</p><p className="mt-2 text-sm text-[#17221e]/55">Add Spotify track IDs, recognizable artists, or genre fields to the CSV. Unresolved rows remain visible below.</p></div>}
          {view === 'time' && <div className="mt-7 bg-[#f3efe4] p-3 sm:p-5">
            <AlbumTimeline marks={albumMarks} genres={genreOrder} counts={genreCounts} range={RECORDED_TIMELINE_RANGE} label="Uploaded playlist genre timeline. Swipe or scroll horizontally to move through time." selectedId={selectedAlbum?.id} onSelect={setSelectedAlbum} />
            {dated < tracks.length && <p className="mt-3 text-xs text-[#17221e]/55">{(tracks.length - dated).toLocaleString()} tracks have no date yet. You can still find them in Albums.</p>}
          </div>}
          {selectedAlbum && (view === 'time' || view === 'albums') && <aside aria-label="Selected album" className="mt-5 flex items-start gap-5 border-y border-[#17221e]/15 py-5">
            <AlbumArtwork album={selectedAlbum.album || selectedAlbum.title} artist={selectedAlbum.artists} coverUrl={selectedAlbum.coverUrl} spotifyAlbumId={selectedAlbum.spotifyAlbumId} spotifyTrackId={selectedAlbum.spotifyTrackId} className="size-24 shrink-0" />
            <div className="min-w-0"><h3 className="font-serif text-2xl">{selectedAlbum.album || selectedAlbum.title}</h3><p className="mt-1 text-sm text-[#17221e]/65">{selectedAlbum.artists}</p><p className="mt-2 text-xs text-[#17221e]/50">{selectedAlbum.genre}{selectedAlbum.year ? ` · ${selectedAlbum.year}` : ''} · {selectedAlbum.count} track{selectedAlbum.count === 1 ? '' : 's'}</p>
              {(selectedAlbum.spotifyAlbumId || selectedAlbum.spotifyTrackId) && <a href={`https://open.spotify.com/${selectedAlbum.spotifyAlbumId ? 'album' : 'track'}/${selectedAlbum.spotifyAlbumId || selectedAlbum.spotifyTrackId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-xs underline underline-offset-2">Open in Spotify</a>}
            </div>
          </aside>}
          {view === 'map' && (mapStatus === 'idle' || mapStatus === 'loading') && <div className="mt-4 grid min-h-56 place-items-center border border-dashed border-[#17221e]/25 bg-white/20 p-6 text-sm text-[#17221e]/55"><span>Loading the map layer…</span></div>}
          {view === 'map' && mapStatus === 'failed' && <LayerFailure title="Geography couldn’t load." detail={mapError} onRetry={loadMapLayer} />}
          {view === 'map' && worldPath && <div className="mt-4 overflow-hidden border border-[#17221e]/15 bg-[#dfe8dd]">
            <svg viewBox="0 0 1000 500" aria-label="Map of uploaded playlist artist origins" className="h-auto w-full"><path d={worldPath} fill="#f3efe4" stroke="#17221e" strokeOpacity="0.25" strokeWidth="0.65" />{places.map((place) => <circle key={`${place.x}-${place.y}`} cx={place.x} cy={place.y} r={Math.min(13, 3 + Math.sqrt(place.count) * 2)} fill="#b45238" fillOpacity=".72"><title>{place.label}: {place.count} tracks</title></circle>)}</svg>
          </div>}
          <div className="mt-8">
          <ImportPipeline tracks={tracks} classified={classified} dated={dated} mapped={mapped} genreSpace={genreSpace} spaceStatus={spaceStatus} />
          <div className="grid grid-cols-2 border border-[#17221e]/15 bg-white/25 sm:grid-cols-4">
            <UploadMetric value={tracks.length} label="tracks read" />
            <UploadMetric value={dated} label="placed in time" />
            <UploadMetric value={mapped} label="placed on map" />
            <UploadMetric value={genreSpace?.payload.summary.tracks ?? 0} label={spaceStatus === 'failed' ? 'genre space retry needed' : spaceStatus === 'ready' ? 'placed in genre space' : 'genre space loading'} />
          </div>
          </div>
          {genreSpace && genreSpace.unresolved.length > 0 && <details className="mt-4 border border-[#17221e]/15 bg-white/20 p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{genreSpace.unresolved.length} still need genre evidence</summary><p className="mt-2 text-xs leading-relaxed text-[#17221e]/55">The local evidence cascade could not identify these artists yet. They remain explicit while the shared index grows.</p><ul className="mt-3 grid gap-2">{genreSpace.unresolved.slice(0, 12).map((track, index) => <li key={`${track.track}-${track.artist}-${index}`} className="text-xs"><strong className="font-medium">{track.track}</strong><span className="text-[#17221e]/50"> · {track.artist}</span></li>)}</ul>{genreSpace.unresolved.length > 12 && <p className="mt-3 text-xs text-[#17221e]/45">Plus {(genreSpace.unresolved.length - 12).toLocaleString()} more rows.</p>}</details>}
          <p className="mt-3 text-xs leading-relaxed text-[#17221e]/50">{tracks.filter((track) => track.method === 'exact track').length} exact track matches · {tracks.filter((track) => track.method === 'artist inference').length} artist inferences · {tracks.filter((track) => track.method === 'uploaded metadata').length} rows placed from uploaded metadata</p>
        </>}
      </div>
    </div>
  </section>;
}

function ImportPipeline({ tracks, classified, dated, mapped, genreSpace, spaceStatus }: { tracks: AnalyzedTrack[]; classified: number; dated: number; mapped: number; genreSpace: VisitorGenreSpaceResult | null; spaceStatus: LayerStatus }) {
  const exact = tracks.filter((track) => track.method === 'exact track').length;
  const artist = tracks.filter((track) => track.method === 'artist inference').length;
  const space = genreSpace?.payload.summary.tracks ?? 0;
  const stages = [
    { label: 'Playlist', value: `${tracks.length.toLocaleString()} read`, done: true },
    { label: 'Evidence', value: `${exact.toLocaleString()} exact · ${artist.toLocaleString()} artist`, done: true },
    { label: 'Genre', value: `${classified.toLocaleString()} / ${tracks.length.toLocaleString()}`, done: true },
    { label: 'Time', value: `${dated.toLocaleString()} / ${tracks.length.toLocaleString()}`, done: true },
    { label: 'Geography', value: `${mapped.toLocaleString()} / ${tracks.length.toLocaleString()}`, done: true },
    { label: 'Genre space', value: genreSpace ? `${space.toLocaleString()} / ${tracks.length.toLocaleString()}` : spaceStatus === 'failed' ? 'not loaded · retry' : 'loading deeper layer', done: Boolean(genreSpace) },
  ];
  return <ol aria-label="Playlist import progress" className="mb-4 grid grid-cols-2 border border-[#17221e]/15 bg-white/30 sm:grid-cols-3 xl:grid-cols-6">
    {stages.map((stage) => <li key={stage.label} className="min-w-0 border-r border-b border-[#17221e]/10 p-3 last:border-r-0 sm:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(3n)]:border-r xl:last:border-r-0">
      <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#17221e]/45">{stage.done ? <Check className="size-3 text-[#4f7d45]" /> : <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />} {stage.label}</span>
      <strong className="mt-1 block truncate text-[11px] font-medium" title={stage.value}>{stage.value}</strong>
    </li>)}
  </ol>;
}

function LayerFailure({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return <section className="mt-4 grid min-h-56 place-items-center border border-dashed border-[#a33826]/35 bg-white/20 p-6 text-center" aria-live="assertive"><div><p className="font-serif text-2xl">{title}</p><p className="mt-2 max-w-md text-xs leading-relaxed text-[#17221e]/55">{detail} The completed time view and browser-local checkpoint are unchanged.</p><button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-full border border-[#17221e]/25 px-5 text-xs font-medium">Retry this layer</button></div></section>;
}

function UploadMetric({ value, label }: { value: number; label: string }) {
  return <div className="min-w-0 border-r border-b border-[#17221e]/15 p-3 even:border-r-0 [&:nth-child(n+3)]:border-b-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0"><strong className="font-serif text-2xl font-normal">{value.toLocaleString()}</strong><span className="mt-1 block font-mono text-[8px] uppercase leading-tight tracking-[.06em] text-[#17221e]/45 sm:tracking-[.08em]">{label}</span></div>;
}

function UploadViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button aria-pressed={active} onClick={onClick} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium sm:rounded-full ${active ? 'bg-[#17221e] text-[#f3efe4]' : 'hover:bg-white/35'}`}>{icon}{label}</button>;
}
