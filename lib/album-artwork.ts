export type ArtworkSource = { coverUrl?: string | null; spotifyAlbumId?: string | null; spotifyTrackId?: string | null };
export type ArtworkResolution = 'thumbnail' | 'full';
export type ArtworkCatalog = { version: 1; albums: Record<string, string>; [key: string]: unknown };

const urls = new Map<string, string | null>();
const pendingUrls = new Map<string, Promise<string | null>>();
const images = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, Promise<HTMLImageElement | null>>();
const waiting: (() => void)[] = [];
const URL_CACHE_LIMIT = 2048;
const CATALOG_TIMEOUT_MS = 2000;
const spotifyImageHosts = new Set(['i.scdn.co', 'image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']);
let active = 0;
let catalogLoader: (() => Promise<ArtworkCatalog>) | null = null;
let catalogResult: Promise<ArtworkCatalog | null> | null = null;
let catalogGeneration = 0;

export function safeArtworkUrl(value?: string | null) {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

/** Only known Spotify image encodings are resized; fixtures, archive images, and other URLs are unchanged. */
export function spotifyThumbnailUrl(value: string, resolution: ArtworkResolution = 'thumbnail'): string {
  const url = trustedSpotifyUrl(value);
  const image = url?.pathname.match(/^\/image\/ab67616d0000(?:b273|1e02|4851)([0-9a-f]{24})$/iu);
  if (!url || !image) return value;
  url.pathname = `/image/ab67616d0000${resolution === 'full' ? '1e02' : '4851'}${image[1]}`;
  return url.href;
}

/** Register one lazy public metadata loader. Reconfiguration explicitly clears previous resolution caches. */
export function configureArtworkCatalogLoader(loader: () => Promise<ArtworkCatalog>): void {
  if (catalogLoader === loader) return;
  catalogLoader = loader; catalogResult = null; catalogGeneration += 1;
  urls.clear(); pendingUrls.clear(); images.clear(); pendingImages.clear();
}

export function artworkKey(source: ArtworkSource) {
  return safeArtworkUrl(source.coverUrl) || source.spotifyAlbumId || source.spotifyTrackId || '';
}

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      void Promise.resolve().then(job).then(resolve, reject).finally(() => { active -= 1; waiting.shift()?.(); });
    };
    if (active < 4) run(); else waiting.push(run);
  });
}

function trustedSpotifyUrl(value?: string | null): URL | null {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && spotifyImageHosts.has(url.hostname) ? url : null;
  } catch { return null; }
}
function validId(value?: string | null): value is string { return typeof value === 'string' && /^[A-Za-z0-9]{22}$/u.test(value); }

function loadCatalog(): Promise<ArtworkCatalog | null> {
  if (!catalogLoader) return Promise.resolve(null);
  if (catalogResult) return catalogResult;
  const loader = catalogLoader;
  catalogResult = new Promise((resolve) => {
    let settled = false;
    const finish = (catalog: ArtworkCatalog | null) => { if (settled) return; settled = true; clearTimeout(timeout); resolve(catalog); };
    const timeout = setTimeout(() => finish(null), CATALOG_TIMEOUT_MS);
    void Promise.resolve().then(loader).then((catalog) => {
      if (settled) return;
      if (!catalog || catalog.version !== 1 || !catalog.albums || typeof catalog.albums !== 'object' || Array.isArray(catalog.albums)) { finish(null); return; }
      const albums: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const [id, value] of Object.entries(catalog.albums)) {
        if (!validId(id) || typeof value !== 'string') continue;
        const url = trustedSpotifyUrl(value);
        if (url) albums[id] = url.href;
      }
      finish({ version: 1, albums });
    }, () => finish(null));
  });
  return catalogResult;
}

function spotifyMetadata(key: string): Promise<string | null> {
  if (urls.has(key)) {
    const cached = urls.get(key) ?? null;
    urls.delete(key); urls.set(key, cached);
    return Promise.resolve(cached);
  }
  const pending = pendingUrls.get(key);
  if (pending) return pending;
  const generation = catalogGeneration;
  const result = schedule(async () => {
    try {
      const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${key}`)}`, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) return null;
      const body = await response.json() as { thumbnail_url?: string };
      return trustedSpotifyUrl(body.thumbnail_url)?.href || null;
    } catch { return null; }
  }).then((url) => {
    if (generation === catalogGeneration) {
      if (urls.size >= URL_CACHE_LIMIT) urls.delete(urls.keys().next().value!);
      urls.set(key, url);
    }
    return url;
  });
  pendingUrls.set(key, result);
  void result.finally(() => { if (pendingUrls.get(key) === result) pendingUrls.delete(key); });
  return result;
}

export async function resolveArtwork(source: ArtworkSource, fallback = false, resolution: ArtworkResolution = 'thumbnail'): Promise<string | null> {
  const direct = safeArtworkUrl(source.coverUrl);
  const albumId = validId(source.spotifyAlbumId) ? source.spotifyAlbumId : null;
  const trackId = validId(source.spotifyTrackId) ? source.spotifyTrackId : null;
  const key = albumId ? `album/${albumId}` : trackId ? `track/${trackId}` : '';
  const preferSpotify = Boolean(direct && new URL(direct).hostname === 'coverartarchive.org' && key);
  // Explicit non-archive covers stay immediate; an archive URL remains the actual error fallback.
  if (direct && ((!fallback && !preferSpotify) || (fallback && preferSpotify))) return spotifyThumbnailUrl(direct, resolution);
  if (!key) return direct ? spotifyThumbnailUrl(direct, resolution) : null;
  if (!fallback && albumId && (!direct || preferSpotify)) {
    const catalog = await loadCatalog();
    const fromCatalog = catalog?.albums[albumId];
    if (fromCatalog) return spotifyThumbnailUrl(fromCatalog, resolution);
  }
  const resolved = await spotifyMetadata(key);
  return resolved ? spotifyThumbnailUrl(resolved, resolution) : preferSpotify ? direct : null;
}

export function peekArtworkImage(source: ArtworkSource) { return images.get(artworkKey(source)); }

export function loadArtworkImage(source: ArtworkSource): Promise<HTMLImageElement | null> {
  const key = artworkKey(source);
  if (!key) return Promise.resolve(null);
  const image = images.get(key);
  if (image) return Promise.resolve(image);
  const pending = pendingImages.get(key);
  if (pending) return pending;
  const generation = catalogGeneration;
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
    let image = await load(await resolveArtwork(source, false, 'thumbnail'));
    if (!image && source.coverUrl) image = await load(await resolveArtwork(source, true, 'thumbnail'));
    if (image && generation === catalogGeneration) {
      // Keep decoded artwork bounded across filters, zooms, and large playlists.
      if (images.size >= 256) images.delete(images.keys().next().value!);
      images.set(key, image);
    }
    return image;
  })();
  pendingImages.set(key, result);
  void result.finally(() => { if (pendingImages.get(key) === result) pendingImages.delete(key); });
  return result;
}
