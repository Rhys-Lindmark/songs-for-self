export type ArtworkSource = { coverUrl?: string | null; spotifyAlbumId?: string | null; spotifyTrackId?: string | null };

const urls = new Map<string, Promise<string | null>>();
const images = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, Promise<HTMLImageElement | null>>();
const waiting: (() => void)[] = [];
let active = 0;

export function safeArtworkUrl(value?: string | null) {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export function artworkKey(source: ArtworkSource) {
  return safeArtworkUrl(source.coverUrl) || source.spotifyAlbumId || source.spotifyTrackId || '';
}

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      void job().then(resolve, reject).finally(() => { active -= 1; waiting.shift()?.(); });
    };
    if (active < 4) run(); else waiting.push(run);
  });
}

export function resolveArtwork(source: ArtworkSource, fallback = false): Promise<string | null> {
  const direct = safeArtworkUrl(source.coverUrl);
  const id = source.spotifyAlbumId || source.spotifyTrackId;
  const validId = Boolean(id && /^[A-Za-z0-9]{22}$/.test(id));
  // Spotify thumbnails are faster than archive redirects for a wall of covers.
  // Preserve supplied CDN images, and keep the archive URL as a real fallback.
  const preferSpotify = Boolean(direct && new URL(direct).hostname === 'coverartarchive.org' && validId);
  if (direct && ((!fallback && !preferSpotify) || (fallback && preferSpotify))) return Promise.resolve(direct);
  if (!validId) return Promise.resolve(direct);
  const key = `${source.spotifyAlbumId ? 'album' : 'track'}/${id}`;
  const cached = urls.get(key);
  if (cached) return preferSpotify ? cached.then((url) => url || direct) : cached;
  const result = schedule(async () => {
    try {
      const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${key}`)}`, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) return null;
      const body = await response.json() as { thumbnail_url?: string };
      const url = safeArtworkUrl(body.thumbnail_url);
      if (!url) return null;
      const host = new URL(url).hostname;
      return host === 'i.scdn.co' || host.endsWith('.spotifycdn.com') ? url : null;
    } catch { return null; }
  });
  urls.set(key, result);
  return preferSpotify ? result.then((url) => url || direct) : result;
}

export function peekArtworkImage(source: ArtworkSource) { return images.get(artworkKey(source)); }

export function loadArtworkImage(source: ArtworkSource): Promise<HTMLImageElement | null> {
  const key = artworkKey(source);
  if (!key) return Promise.resolve(null);
  const image = images.get(key);
  if (image) return Promise.resolve(image);
  const pending = pendingImages.get(key);
  if (pending) return pending;
  const load = async (url: string | null) => {
    if (!url) return null;
    return schedule(() => new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      const timeout = window.setTimeout(() => { image.src = ''; resolve(null); }, 8000);
      image.onload = () => { clearTimeout(timeout); resolve(image); };
      image.onerror = () => { clearTimeout(timeout); resolve(null); };
      image.src = url;
    }));
  };
  const result = (async () => {
    let image = await load(await resolveArtwork(source));
    if (!image && source.coverUrl) image = await load(await resolveArtwork(source, true));
    if (image) {
      // Keep decoded artwork bounded across filters, zooms, and large playlists.
      if (images.size >= 256) images.delete(images.keys().next().value!);
      images.set(key, image);
    }
    return image;
  })();
  pendingImages.set(key, result);
  void result.finally(() => { pendingImages.delete(key); });
  return result;
}
