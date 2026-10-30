import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveArtwork, safeArtworkUrl } from '../lib/album-artwork.ts';

await test('artwork lookup deduplicates albums and bounds concurrent Spotify requests', async () => {
  const original = globalThis.fetch;
  let active = 0;
  let peak = 0;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1; active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Response(JSON.stringify({ thumbnail_url: 'https://i.scdn.co/image/verified-cover' }));
  };
  try {
    const sources = Array.from({ length: 12 }, (_, index) => ({ spotifyAlbumId: String(index).padStart(22, '0') }));
    const results = await Promise.all([...sources, ...sources].map((source) => resolveArtwork(source)));
    assert.equal(requests, 12);
    assert.ok(peak <= 4);
    assert.ok(results.every((result) => result === 'https://i.scdn.co/image/verified-cover'));
  } finally { globalThis.fetch = original; }
});

await test('artwork handles missing metadata, bad URLs, and failed or untrusted thumbnails', async () => {
  assert.equal(safeArtworkUrl('javascript:alert(1)'), null);
  assert.equal(await resolveArtwork({}), null);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    assert.equal(await resolveArtwork({ spotifyTrackId: 'AAAAAAAAAAAAAAAAAAAAAA' }), null);
    globalThis.fetch = async () => new Response(JSON.stringify({ thumbnail_url: 'https://untrusted.example/cover.jpg' }));
    assert.equal(await resolveArtwork({ spotifyTrackId: 'BBBBBBBBBBBBBBBBBBBBBB' }), null);
    assert.equal(await resolveArtwork({ coverUrl: 'https://i.scdn.co/image/direct-cover' }), 'https://i.scdn.co/image/direct-cover');
  } finally { globalThis.fetch = original; }
});
