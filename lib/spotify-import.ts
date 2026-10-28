export const SPOTIFY_IMPORT_SCOPES = ['playlist-read-private', 'playlist-read-collaborative'] as const;
export const SPOTIFY_PENDING_STORAGE_KEY = 'songs-for-self.spotify.pending';
export const SPOTIFY_CLIENT_ID_STORAGE_KEY = 'songs-for-self.spotify.client-id';
export const SPOTIFY_ACCOUNTS_ORIGIN = 'https://accounts.spotify.com';
export const SPOTIFY_API_ORIGIN = 'https://api.spotify.com';

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9]{16,64}$/;
const VERIFIER_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export type SpotifyImportProgress = {
  phase: 'authorizing' | 'fetching' | 'ready';
  fetched: number;
  total: number | null;
  requests: number;
};

type SpotifyTrack = {
  id?: string | null;
  name?: string;
  type?: string;
  uri?: string;
  artists?: Array<{ id?: string | null; name?: string }>;
  album?: { id?: string | null; name?: string; release_date?: string };
};

type SpotifyPlaylistItem = {
  is_local?: boolean;
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
};

type SpotifyItemsPage = {
  items?: SpotifyPlaylistItem[];
  total?: number;
  offset?: number;
  limit?: number;
  next?: string | null;
};

export type SpotifyPlaylistRows = {
  rows: Record<string, string>[];
  total: number;
  skipped: number;
  requests: number;
};

export function parseSpotifyPlaylistId(input: string) {
  const value = input.trim();
  if (PLAYLIST_ID_PATTERN.test(value)) return value;
  const uriMatch = value.match(/^spotify:playlist:([A-Za-z0-9]{22})$/i);
  if (uriMatch) return uriMatch[1];
  try {
    const url = new URL(value);
    if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const playlistIndex = segments.findIndex((segment) => segment.toLowerCase() === 'playlist');
    const candidate = playlistIndex >= 0 ? segments[playlistIndex + 1] : null;
    return candidate && PLAYLIST_ID_PATTERN.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function normalizeSpotifyClientId(input: string) {
  const value = input.trim();
  return CLIENT_ID_PATTERN.test(value) ? value : null;
}

export function spotifyRedirectUri(location: Pick<Location, 'origin' | 'pathname'>) {
  const origin = new URL(location.origin);
  if (origin.hostname === 'localhost') origin.hostname = '127.0.0.1';
  return `${origin.origin}${location.pathname}`;
}

export function createCodeVerifier(randomValues: Uint8Array) {
  if (randomValues.length < 43) throw new Error('PKCE verifier entropy must contain at least 43 bytes.');
  return Array.from(randomValues, (value) => VERIFIER_CHARACTERS[value % VERIFIER_CHARACTERS.length]).join('');
}

export async function createCodeChallenge(verifier: string, subtle: SubtleCrypto) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function createSpotifyAuthorization(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
  subtle: SubtleCrypto;
}) {
  const challenge = await createCodeChallenge(input.verifier, input.subtle);
  const url = new URL('/authorize', SPOTIFY_ACCOUNTS_ORIGIN);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    response_type: 'code',
    redirect_uri: input.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state: input.state,
    scope: SPOTIFY_IMPORT_SCOPES.join(' '),
  }).toString();
  return url.toString();
}

export async function exchangeSpotifyCode(input: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}) {
  const response = await (input.fetcher ?? fetch)(`${SPOTIFY_ACCOUNTS_ORIGIN}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Spotify authorization could not be completed.');
  return { accessToken: payload.access_token, expiresIn: payload.expires_in ?? 3600, refreshToken: payload.refresh_token ?? null };
}

export async function fetchSpotifyPlaylistRows(input: {
  playlistId: string;
  accessToken: string;
  fetcher?: typeof fetch;
  onProgress?: (progress: SpotifyImportProgress) => void;
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
  paginationConcurrency?: number;
}) {
  if (!PLAYLIST_ID_PATTERN.test(input.playlistId)) throw new Error('That is not a valid Spotify playlist ID.');
  const fetcher = input.fetcher ?? fetch;
  const wait = input.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const rows: Record<string, string>[] = [];
  let skipped = 0;
  let requests = 0;
  let total: number | null = null;
  let completedPositions = 0;
  const paginationConcurrency = Math.max(1, Math.min(6, Math.floor(input.paginationConcurrency ?? 3)));

  async function fetchPage(offset: number) {
    let rateLimitRetries = 0;
    while (true) {
      input.onProgress?.({ phase: 'fetching', fetched: completedPositions, total, requests });
      const url = new URL(`/v1/playlists/${input.playlistId}/items`, SPOTIFY_API_ORIGIN);
      url.searchParams.set('limit', '50');
      url.searchParams.set('offset', String(offset));
      const response = await fetcher(url, { headers: { Authorization: `Bearer ${input.accessToken}` }, signal: input.signal });
      requests += 1;
      if (response.status === 429) {
        const payload = await response.json().catch(() => ({})) as { reason?: string; error?: { reason?: string } };
        if (payload.reason === 'QUOTA_EXCEEDED' || payload.error?.reason === 'QUOTA_EXCEEDED') {
          throw new Error('Spotify’s developer quota is exhausted for now. The playlist is fine; wait for the quota window to reset, then retry the complete import.');
        }
        rateLimitRetries += 1;
        if (rateLimitRetries > 4) throw new Error('Spotify is still rate-limiting this import. Wait a moment and try again.');
        const retryAfter = Math.max(1, Number(response.headers.get('retry-after') || 1));
        await wait(retryAfter * 1000);
        if (input.signal?.aborted) throw new DOMException('The Spotify import was cancelled.', 'AbortError');
        continue;
      }
      if (response.status === 401) throw new Error('Your Spotify session expired. Connect again to continue.');
      if (response.status === 403) throw new Error('Spotify refused playlist access. Confirm that the signed-in account owns or collaborates on the playlist and is the app owner or an allowlisted development tester.');
      if (!response.ok) throw new Error(`Spotify could not read this playlist (${response.status}).`);
      const page = await response.json() as SpotifyItemsPage;
      total = Number.isFinite(page.total) ? Number(page.total) : total;
      completedPositions += (page.items ?? []).length;
      input.onProgress?.({ phase: 'fetching', fetched: completedPositions, total, requests });
      return { offset, page };
    }
  }

  const pages = [await fetchPage(0)];
  const firstItems = pages[0].page.items ?? [];
  const pageSize = Number.isFinite(pages[0].page.limit) && Number(pages[0].page.limit) > 0
    ? Number(pages[0].page.limit)
    : firstItems.length;
  if (total !== null && pages[0].page.next && pageSize > 0) {
    const remainingOffsets = Array.from(
      { length: Math.ceil(Math.max(0, total - pageSize) / pageSize) },
      (_, index) => pageSize * (index + 1),
    );
    for (let index = 0; index < remainingOffsets.length; index += paginationConcurrency) {
      pages.push(...await Promise.all(remainingOffsets.slice(index, index + paginationConcurrency).map(fetchPage)));
    }
  } else {
    let offset = firstItems.length;
    let next = pages[0].page.next;
    while (next && offset > 0) {
      const result = await fetchPage(offset);
      pages.push(result);
      const consumed = (result.page.items ?? []).length;
      offset += consumed;
      next = consumed ? result.page.next : null;
    }
  }

  for (const { page } of pages.sort((left, right) => left.offset - right.offset)) {
    const items = page.items ?? [];
    for (const entry of items) {
      const track = entry.item ?? entry.track;
      if (!track || track.type !== 'track' || entry.is_local || !track.id) { skipped += 1; continue; }
      rows.push({
        'Track Name': track.name ?? 'Untitled track',
        'Artist Name(s)': (track.artists ?? []).map((artist) => artist.name).filter(Boolean).join('; '),
        'Artist IDs': (track.artists ?? []).map((artist) => artist.id).filter(Boolean).join('; '),
        'Album Name': track.album?.name ?? '',
        'Album ID': track.album?.id ?? '',
        'Release Date': track.album?.release_date ?? '',
        'Spotify Track ID': track.id,
        'Track URI': track.uri ?? `spotify:track:${track.id}`,
      });
    }
  }

  input.onProgress?.({ phase: 'ready', fetched: rows.length + skipped, total, requests });
  return { rows, total: total ?? rows.length + skipped, skipped, requests } satisfies SpotifyPlaylistRows;
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
