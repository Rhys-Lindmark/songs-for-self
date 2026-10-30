import fs from 'node:fs';

const OUTPUT = 'public/album-thumbnails.json';
const CONCURRENCY = 6;
const TIMEOUT_MS = 4000;
const MAX_RETRY_WAIT_MS = 30_000;
const approvedHosts = new Set(['i.scdn.co', 'image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']);
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9]{22}$/u.test(value);
const trustedUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !approvedHosts.has(url.hostname)) return null;
    const image = url.pathname.match(/^\/image\/ab67616d0000(?:b273|1e02|4851)([0-9a-f]{24})$/iu);
    if (image) url.pathname = `/image/ab67616d00004851${image[1]}`;
    return url.href;
  } catch { return null; }
};
const timeline = JSON.parse(fs.readFileSync('public/timeline-data.json', 'utf8'));
const includeAll = process.argv.includes('--all');
const atlas = includeAll ? JSON.parse(fs.readFileSync('public/genre-space-data.json', 'utf8')) : null;
const ids = new Set();
const albums = Object.create(null);
const remember = (id, url) => { if (!validId(id)) return; ids.add(id); const trusted = typeof url === 'string' ? trustedUrl(url) : null; if (trusted) albums[id] = trusted; };
for (const point of timeline.timeline || []) for (const album of point.albums || []) remember(album.spotifyAlbumId, album.coverUrl);
for (const point of atlas?.points || []) remember(point.spotifyAlbumId, point.coverUrl);
for (const [id, album] of Object.entries(atlas?.albums || {})) remember(id, album.coverUrl);
if (fs.existsSync(OUTPUT)) {
  const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  if (existing.version === 1 && existing.albums && typeof existing.albums === 'object' && !Array.isArray(existing.albums)) {
    for (const [id, url] of Object.entries(existing.albums)) if (ids.has(id) && typeof url === 'string') { const trusted = trustedUrl(url); if (trusted) albums[id] = trusted; }
  }
}
const pending = [...ids].filter((id) => !albums[id]).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
const reused = Object.keys(albums).length;
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ dryRun: true, scope: includeAll ? 'all-public' : 'timeline', publicAlbumIds: ids.size, reused, pending: pending.length, concurrency: CONCURRENCY, timeoutMs: TIMEOUT_MS, maxRetries: 1, maxRetryWaitMs: MAX_RETRY_WAIT_MS }));
} else {
  let cursor = 0; let requests = 0; let retried = 0; let rateLimited = 0; let failed = 0; let attempted = 0;
  let blockedUntil = 0; let stoppedForRetryAfter = false;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitForServer = async () => {
    while (!stoppedForRetryAfter && blockedUntil > Date.now()) await sleep(blockedUntil - Date.now());
    return !stoppedForRetryAfter;
  };
  const retryDelay = (header) => {
    if (!header) return 1000;
    if (/^\d+(?:\.\d+)?$/u.test(header.trim())) return Math.ceil(Number(header) * 1000);
    const date = Date.parse(header); return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1000;
  };
  const honorRetryAfter = (response) => {
    const delay = retryDelay(response.headers.get('Retry-After'));
    if (delay > MAX_RETRY_WAIT_MS) { stoppedForRetryAfter = true; return false; }
    blockedUntil = Math.max(blockedUntil, Date.now() + delay);
    return true;
  };
  const lookup = async (id) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!await waitForServer()) return null;
      if (attempt) retried += 1;
      try {
        requests += 1;
        const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/album/${id}`)}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
        if (response.status === 429 || (response.status === 503 && response.headers.has('Retry-After'))) {
          if (response.status === 429) rateLimited += 1;
          const canRetry = honorRetryAfter(response);
          await response.body?.cancel();
          if (attempt === 0 && canRetry) continue;
          return null;
        }
        if (!response.ok) { await response.body?.cancel(); if (attempt === 0 && response.status >= 500) { await sleep(250); continue; } return null; }
        const body = await response.json();
        return typeof body.thumbnail_url === 'string' ? trustedUrl(body.thumbnail_url) : null;
      } catch { if (attempt === 0 && !stoppedForRetryAfter) { await sleep(250); continue; } return null; }
    }
    return null;
  };
  const worker = async () => {
    while (cursor < pending.length && !stoppedForRetryAfter) {
      const id = pending[cursor++]; attempted += 1;
      const url = await lookup(id);
      if (url) albums[id] = url; else failed += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));
  const ordered = Object.fromEntries(Object.entries(albums).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const summary = { scope: includeAll ? 'all-public' : 'timeline', publicAlbumIds: ids.size, resolved: Object.keys(ordered).length, reused, fetched: Object.keys(ordered).length - reused, missing: ids.size - Object.keys(ordered).length, attempted, failed, requests, retries: retried, rateLimitedResponses: rateLimited, deferred: pending.length - attempted, stoppedForRetryAfter, concurrency: CONCURRENCY, timeoutMs: TIMEOUT_MS, maxRetries: 1, maxRetryWaitMs: MAX_RETRY_WAIT_MS };
  fs.writeFileSync(OUTPUT, `${JSON.stringify({ version: 1, albums: ordered, summary })}\n`);
  console.log(JSON.stringify(summary));
}
