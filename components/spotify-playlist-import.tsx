'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ClipboardPaste, ExternalLink, LockKeyhole } from 'lucide-react';
import {
  createCodeVerifier,
  createSpotifyAuthorization,
  exchangeSpotifyCode,
  fetchSpotifyPlaylistRows,
  parseSpotifyPlaylistId,
  normalizeSpotifyClientId,
  SPOTIFY_CLIENT_ID_STORAGE_KEY,
  SPOTIFY_PENDING_STORAGE_KEY,
  spotifyRedirectUri,
  type SpotifyImportProgress,
} from '@/lib/spotify-import';
import { publicApiUrl } from '@/lib/public-asset-url';
import { extractSpotifyTrackIds } from '@/lib/spotify-copied-tracks';
import { clearStoredSpotifyCopiedImport, loadStoredSpotifyCopiedImport, makeStoredSpotifyCopiedImport, saveStoredSpotifyCopiedImport, type StoredSpotifyCopiedImport } from '@/lib/spotify-copied-import-store';

type PendingAuthorization = { playlistId: string; clientId: string; verifier: string; state: string; redirectUri: string };
type PublicPreviewResponse = { title: string; owner: string; total: number | null; rows: Record<string, string>[]; error?: string };

export function SpotifyPlaylistImport({ configuredClientId = '', disabled, onRows }: { configuredClientId?: string; disabled: boolean; onRows: (rows: Record<string, string>[], fileName: string) => Promise<void> }) {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<SpotifyImportProgress | null>(null);
  const deployedClientId = normalizeSpotifyClientId(configuredClientId) ?? '';
  const [clientId, setClientId] = useState(deployedClientId);
  const [clientIdDraft, setClientIdDraft] = useState('');
  const [showOwnerSetup, setShowOwnerSetup] = useState(false);
  const [previewNote, setPreviewNote] = useState('');
  const [showCopiedImport, setShowCopiedImport] = useState(false);
  const [copiedText, setCopiedText] = useState('');
  const [copiedProgress, setCopiedProgress] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const [copiedCheckpoint, setCopiedCheckpoint] = useState<StoredSpotifyCopiedImport | null>(null);
  const copiedTrackCount = extractSpotifyTrackIds(copiedText).length;

  const previewPublicPlaylist = useCallback(async (playlistId: string, reason = '') => {
    setError('');
    setProgress({ phase: 'fetching', fetched: 0, total: null, requests: 0 });
    setPreviewNote('');
    try {
      const response = await fetch(`${publicApiUrl('spotify-preview')}?playlist=${encodeURIComponent(playlistId)}`);
      const payload = await response.json() as PublicPreviewResponse;
      if (!response.ok || !payload.rows?.length) throw new Error(payload.error || 'Spotify did not expose a public preview for this playlist.');
      const shown = payload.rows.length;
      const total = payload.total;
      await onRows(payload.rows, `spotify-preview-${playlistId}-${shown}${total ? `-of-${total}` : ''}.csv`);
      setProgress({ phase: 'ready', fetched: shown, total, requests: 1 });
      const coverage = total && total > shown
        ? `Showing Spotify’s public ${shown.toLocaleString()}-track preview of ${total.toLocaleString()} items. This is useful immediately, but it is not the complete playlist.`
        : `Showing all ${shown.toLocaleString()} tracks exposed by Spotify’s public preview.`;
      setPreviewNote(reason ? `${reason} ${coverage}` : coverage);
    } catch (cause) {
      setProgress(null);
      setError(cause instanceof Error ? cause.message : 'Spotify preview could not be read.');
    }
  }, [onRows]);

  useEffect(() => {
    if (deployedClientId) return;
    const savedClientId = normalizeSpotifyClientId(localStorage.getItem(SPOTIFY_CLIENT_ID_STORAGE_KEY) ?? '');
    if (savedClientId) queueMicrotask(() => { setClientId(savedClientId); setClientIdDraft(savedClientId); });
  }, [deployedClientId]);

  useEffect(() => {
    let cancelled = false;
    void loadStoredSpotifyCopiedImport().then((snapshot) => {
      if (!cancelled && snapshot) {
        setCopiedCheckpoint(snapshot);
        setShowCopiedImport(true);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const code = parameters.get('code');
    const returnedState = parameters.get('state');
    const spotifyError = parameters.get('error');
    if (!code && !spotifyError) return;
    const pending = readPendingAuthorization();
    clearAuthorizationQuery();
    if (spotifyError) { sessionStorage.removeItem(SPOTIFY_PENDING_STORAGE_KEY); queueMicrotask(() => setError('Spotify connection was cancelled. Your CSV fallback is still available.')); return; }
    if (!pending || pending.state !== returnedState || !normalizeSpotifyClientId(pending.clientId)) { sessionStorage.removeItem(SPOTIFY_PENDING_STORAGE_KEY); queueMicrotask(() => setError('Spotify could not verify this connection. Please start again.')); return; }
    let cancelled = false;
    const controller = new AbortController();
    void (Promise.resolve().then(async () => {
      try {
        setProgress({ phase: 'authorizing', fetched: 0, total: null, requests: 0 });
        const token = await exchangeSpotifyCode({ clientId: pending.clientId, code: code ?? '', verifier: pending.verifier, redirectUri: pending.redirectUri });
        if (cancelled) return;
        const imported = await fetchSpotifyPlaylistRows({ playlistId: pending.playlistId, accessToken: token.accessToken, onProgress: setProgress, signal: controller.signal });
        if (cancelled) return;
        await onRows(imported.rows, `spotify-${pending.playlistId}.csv`);
        setPlaylistUrl(`https://open.spotify.com/playlist/${pending.playlistId}`);
        setProgress({ phase: 'ready', fetched: imported.rows.length, total: imported.total, requests: imported.requests });
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : 'Spotify import could not be completed.';
          if (message.startsWith('Spotify refused playlist access.')) {
            await previewPublicPlaylist(pending.playlistId, 'Spotify did not grant full owner access, so the complete import could not run.');
          } else {
            setProgress(null);
            setError(message);
          }
        }
      } finally {
        sessionStorage.removeItem(SPOTIFY_PENDING_STORAGE_KEY);
      }
    }));
    return () => { cancelled = true; controller.abort(); };
  }, [onRows, previewPublicPlaylist]);

  async function connect() {
    setError('');
    const playlistId = parseSpotifyPlaylistId(playlistUrl);
    if (!playlistId) { setError('Paste a Spotify playlist link, URI, or 22-character playlist ID.'); return; }
    if (!clientId) return previewPublicPlaylist(playlistId);
    await authorize(playlistId, clientId);
  }

  async function saveOwnerClientId() {
    setError('');
    const normalized = normalizeSpotifyClientId(clientIdDraft);
    if (!normalized) { setError('Paste the public Client ID from the Spotify app dashboard.'); return; }
    localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, normalized);
    setClientId(normalized);
    setShowOwnerSetup(false);
    const playlistId = parseSpotifyPlaylistId(playlistUrl);
    if (playlistId) await authorize(playlistId, normalized);
  }

  async function importCopiedTracks() {
    setError('');
    setPreviewNote('');
    setProgress(null);
    const trackIds = extractSpotifyTrackIds(copiedText);
    if (!trackIds.length) {
      setError('Paste the Spotify track links copied from the desktop playlist.');
      return;
    }
    if (trackIds.length > 10_000) {
      setError('This paste contains more than 10,000 tracks. Split it into smaller playlists first.');
      return;
    }

    await resolveCopiedTracks(trackIds);
  }

  async function resolveCopiedTracks(trackIds: string[], savedRows: Record<string, Record<string, string>> = {}) {
    setError('');
    setPreviewNote('');
    setProgress(null);
    const uniqueIds = [...new Set(trackIds)];
    const allowedIds = new Set(uniqueIds);
    const rows = new Map<string, Record<string, string>>(Object.entries(savedRows).filter(([id]) => allowedIds.has(id)));
    const pendingIds = uniqueIds.filter((id) => !rows.has(id));
    let completed = rows.size;
    let failed = 0;
    setCopiedProgress({ completed, total: uniqueIds.length, failed });
    const initialSnapshot = makeStoredSpotifyCopiedImport(trackIds, Object.fromEntries(rows));
    setCopiedCheckpoint(initialSnapshot);
    void saveStoredSpotifyCopiedImport(initialSnapshot).catch(() => undefined);

    for (let index = 0; index < pendingIds.length; index += 6) {
      const batch = pendingIds.slice(index, index + 6);
      await Promise.all(batch.map(async (id) => {
        try {
          const response = await fetch(`${publicApiUrl('spotify-track-preview')}?track=${encodeURIComponent(id)}`);
          const payload = await response.json() as Record<string, string> & { error?: string };
          if (!response.ok || !payload['Spotify Track ID']) throw new Error(payload.error || 'Track could not be read.');
          rows.set(id, payload);
        } catch {
          failed += 1;
        } finally {
          completed += 1;
          setCopiedProgress({ completed, total: uniqueIds.length, failed });
        }
      }));
      const snapshot = makeStoredSpotifyCopiedImport(trackIds, Object.fromEntries(rows));
      setCopiedCheckpoint(snapshot);
      await saveStoredSpotifyCopiedImport(snapshot).catch(() => undefined);
    }
    const orderedRows = trackIds.flatMap((id) => rows.has(id) ? [rows.get(id)!] : []);
    if (!orderedRows.length) {
      setCopiedProgress(null);
      setError('Spotify did not return any of those public track cards. Try the account-data JSON fallback below.');
      return;
    }
    await onRows(orderedRows, `spotify-copied-${orderedRows.length}-tracks.csv`);
    if (failed) {
      setCopiedProgress(null);
      setPreviewNote(`Imported ${orderedRows.length.toLocaleString()} copied playlist positions; ${failed.toLocaleString()} unique track${failed === 1 ? '' : 's'} could not be read yet. The checkpoint is saved so Resume can retry only those missing tracks. Duplicates and playlist order were preserved.`);
    } else {
      setCopiedCheckpoint(null);
      void clearStoredSpotifyCopiedImport().catch(() => undefined);
      setPreviewNote(`Imported ${orderedRows.length.toLocaleString()} copied playlist positions. Duplicates and playlist order were preserved.`);
    }
  }

  function forgetCopiedCheckpoint() {
    setCopiedCheckpoint(null);
    setCopiedProgress(null);
    void clearStoredSpotifyCopiedImport().catch(() => undefined);
  }

  async function authorize(playlistId: string, activeClientId: string) {
    setPreviewNote('');
    const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
    const stateBytes = crypto.getRandomValues(new Uint8Array(48));
    const verifier = createCodeVerifier(verifierBytes);
    const state = createCodeVerifier(stateBytes).slice(0, 24);
    const redirectUri = spotifyRedirectUri(window.location);
    sessionStorage.setItem(SPOTIFY_PENDING_STORAGE_KEY, JSON.stringify({ playlistId, clientId: activeClientId, verifier, state, redirectUri } satisfies PendingAuthorization));
    setProgress({ phase: 'authorizing', fetched: 0, total: null, requests: 0 });
    window.location.assign(await createSpotifyAuthorization({ clientId: activeClientId, redirectUri, state, verifier, subtle: crypto.subtle }));
  }

  const progressLabel = progress?.phase === 'authorizing'
    ? 'Connecting securely to Spotify…'
    : progress?.phase === 'fetching'
      ? `Reading ${progress.fetched.toLocaleString()}${progress.total ? ` of ${progress.total.toLocaleString()}` : ''} playlist items…`
      : progress?.phase === 'ready'
        ? `${progress.fetched.toLocaleString()} track${progress.fetched === 1 ? '' : 's'} imported in ${progress.requests.toLocaleString()} Spotify request${progress.requests === 1 ? '' : 's'}.`
        : '';

  return <div className="border border-[#17221e]/15 bg-white/30 p-4 sm:p-5">
    <form onSubmit={(event) => { event.preventDefault(); void connect(); }}>
      <label htmlFor="spotify-playlist-url" className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#17221e]/55">Spotify playlist link</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="spotify-playlist-url" value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} placeholder="https://open.spotify.com/playlist/…" inputMode="url" autoComplete="url" className="min-h-12 min-w-0 flex-1 rounded-full border border-[#17221e]/20 bg-[#f8f5ed] px-4 text-sm outline-none placeholder:text-[#17221e]/35 focus:border-[#b45238]" />
        <button disabled={disabled || Boolean(progress && progress.phase !== 'ready') || Boolean(copiedProgress && copiedProgress.completed < copiedProgress.total)} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1db954] px-5 text-sm font-semibold text-[#08130d] hover:bg-[#24c960] disabled:cursor-not-allowed disabled:opacity-55">{clientId ? 'Connect Spotify & import all' : 'Analyze public preview'} <ArrowRight className="size-4" /></button>
      </div>
    </form>
    <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-[#17221e]/55"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" /> {clientId ? 'Spotify asks for read-only playlist access. The token stays in this browser and is discarded after import.' : 'A public link gives an immediate preview. For the complete playlist today, copy its tracks from Spotify Desktop and paste them here.'}</p>
    <button type="button" onClick={() => { setError(''); setShowCopiedImport((value) => !value); }} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-left text-[11px] font-medium text-[#17221e]/70 underline underline-offset-2"><ClipboardPaste className="size-3.5" /> Import the full copied playlist</button>
    {showCopiedImport && <div className="mt-2 border-t border-[#17221e]/15 pt-4">
      <p className="font-serif text-lg">Full playlist—no developer app</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[#17221e]/65">
        <li>Open the playlist in Spotify Desktop and click any track.</li>
        <li>Press <kbd className="rounded bg-[#17221e]/5 px-1">⌘A</kbd> then <kbd className="rounded bg-[#17221e]/5 px-1">⌘C</kbd> on Mac, or <kbd className="rounded bg-[#17221e]/5 px-1">Ctrl+A</kbd> then <kbd className="rounded bg-[#17221e]/5 px-1">Ctrl+C</kbd> on Windows.</li>
        <li>Paste the copied track links below. Songs for Self resolves their public track cards and keeps the original order and duplicates.</li>
      </ol>
      {copiedCheckpoint && !copiedProgress && <output className="mt-3 block border border-[#17221e]/15 bg-white/30 p-3 text-xs leading-relaxed text-[#17221e]/65"><strong className="font-medium text-[#17221e]">Resume copied playlist?</strong> {Object.keys(copiedCheckpoint.rowsById).length.toLocaleString()} of {new Set(copiedCheckpoint.trackIds).size.toLocaleString()} unique tracks are already saved in this browser.<span className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void resolveCopiedTracks(copiedCheckpoint.trackIds, copiedCheckpoint.rowsById)} className="min-h-11 rounded-full bg-[#17221e] px-4 text-xs font-medium text-[#f3efe4]">Resume import</button><button type="button" onClick={forgetCopiedCheckpoint} className="min-h-11 rounded-full px-3 text-xs underline underline-offset-2">Forget checkpoint</button></span></output>}
      <textarea aria-label="Copied Spotify track links" value={copiedText} onChange={(event) => { setCopiedText(event.target.value); setCopiedProgress(null); }} placeholder={'https://open.spotify.com/track/…\nhttps://open.spotify.com/track/…'} rows={5} spellCheck={false} className="mt-3 w-full resize-y rounded-2xl border border-[#17221e]/20 bg-[#f8f5ed] px-4 py-3 font-mono text-xs leading-relaxed outline-none placeholder:text-[#17221e]/30 focus:border-[#b45238]" />
      <button type="button" disabled={disabled || !copiedTrackCount || Boolean(copiedProgress && copiedProgress.completed < copiedProgress.total)} onClick={() => void importCopiedTracks()} className="mt-2 min-h-11 rounded-full border border-[#17221e]/25 px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">{copiedProgress && copiedProgress.completed < copiedProgress.total ? `Reading ${copiedProgress.completed.toLocaleString()} of ${copiedProgress.total.toLocaleString()} unique tracks…` : copiedTrackCount ? `Import ${copiedTrackCount.toLocaleString()} copied playlist positions` : 'Paste copied tracks to import'}</button>
      {copiedProgress && copiedProgress.completed === copiedProgress.total && <p className="mt-2 text-[11px] text-[#17221e]/55">Read {copiedProgress.completed.toLocaleString()} unique public track cards{copiedProgress.failed ? ` · ${copiedProgress.failed.toLocaleString()} unavailable` : ''}.</p>}
    </div>}
    {!clientId && <button type="button" onClick={() => { setError(''); setShowOwnerSetup((value) => !value); }} className="mt-1 min-h-11 text-left text-[11px] text-[#17221e]/50 underline underline-offset-2">Advanced: connect with a Spotify developer app</button>}
    {clientId && <button type="button" onClick={() => { const playlistId = parseSpotifyPlaylistId(playlistUrl); if (playlistId) void previewPublicPlaylist(playlistId); else setError('Paste a Spotify playlist link, URI, or 22-character playlist ID.'); }} className="mt-1 min-h-11 text-left text-[11px] text-[#17221e]/50 underline underline-offset-2">Preview without logging in</button>}
    {clientId && !deployedClientId && <button type="button" onClick={() => setShowOwnerSetup((value) => !value)} className="mt-1 min-h-11 text-left text-[11px] text-[#17221e]/50 underline underline-offset-2">Spotify app configured in this browser · change setup</button>}
    {showOwnerSetup && !deployedClientId && <div className="mt-2 border-t border-[#17221e]/15 pt-4">
      <p className="font-serif text-lg">Full playlist owner import</p>
      <p className="mt-1 text-xs leading-relaxed text-[#17221e]/60">Spotify does not let unrelated third-party apps page through every public playlist anymore. The supported complete route needs a Spotify developer app once; after that, the owner flow imports every available track.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[#17221e]/65">
        <li>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="underline underline-offset-2">Spotify app dashboard</a> and create or open the Songs for Self app.</li>
        <li>Add <code className="break-all rounded bg-[#17221e]/5 px-1">{typeof window === 'undefined' ? 'https://ai.rhyslindmark.com/music' : spotifyRedirectUri(window.location)}</code> as an exact redirect URI. In development mode, the app owner must have Premium and any other tester must be allowlisted.</li>
        <li>Paste the app&apos;s public Client ID here. It is saved only in this browser.</li>
      </ol>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input aria-label="Spotify app Client ID" value={clientIdDraft} onChange={(event) => setClientIdDraft(event.target.value)} placeholder="Spotify app Client ID" autoComplete="off" spellCheck={false} className="min-h-11 min-w-0 flex-1 rounded-full border border-[#17221e]/20 bg-[#f8f5ed] px-4 font-mono text-xs outline-none placeholder:text-[#17221e]/35 focus:border-[#b45238]" />
        <button type="button" onClick={() => void saveOwnerClientId()} className="min-h-11 rounded-full border border-[#17221e]/25 px-4 text-xs font-semibold">Save & connect</button>
      </div>
    </div>}
    {previewNote && <output className="mt-3 block border-l-2 border-[#1db954] pl-3 text-xs leading-relaxed text-[#17221e]/65">{previewNote} {progress?.phase === 'ready' && progress.total && progress.fetched < progress.total && <button type="button" onClick={() => setShowCopiedImport(true)} className="font-medium underline underline-offset-2">Import the full copied playlist</button>}</output>}
    <details className="mt-2 text-[11px] text-[#17221e]/50">
      <summary className="cursor-pointer underline underline-offset-2">Why can Spotify show a public playlist when this app cannot?</summary>
      <p className="mt-2 max-w-2xl leading-relaxed">Spotify&apos;s own player uses first-party services. Its official third-party API now limits playlist-item access to playlists the signed-in person owns or collaborates on, and development apps only work for the owner and allowlisted testers. The public page exposes only a short preview, not a reliable complete export.</p>
      <a href="https://developer.spotify.com/documentation/web-api/reference/get-playlists-items" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 underline underline-offset-2">Spotify&apos;s playlist-items rules <ExternalLink className="size-3" /></a>
    </details>
    <div aria-live="polite">{progressLabel && <p className="mt-3 text-xs font-medium text-[#17221e]/65">{progressLabel}</p>}</div>
    {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-[#a33826]">{error}</p>}
  </div>;
}

function readPendingAuthorization() {
  try {
    const value = sessionStorage.getItem(SPOTIFY_PENDING_STORAGE_KEY);
    return value ? JSON.parse(value) as PendingAuthorization : null;
  } catch {
    return null;
  }
}

function clearAuthorizationQuery() {
  const url = new URL(window.location.href);
  for (const key of ['code', 'state', 'error']) url.searchParams.delete(key);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
