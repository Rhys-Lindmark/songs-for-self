import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/spotify-import.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const spotify = await import(moduleUrl);
const playlistId = '3QNxR8qUDQd8e5KyNsOZgx';

test('parses Spotify playlist URLs, URIs, and IDs without accepting lookalike hosts', () => {
  assert.equal(spotify.parseSpotifyPlaylistId(`https://open.spotify.com/playlist/${playlistId}?si=abc`), playlistId);
  assert.equal(spotify.parseSpotifyPlaylistId(`spotify:playlist:${playlistId}`), playlistId);
  assert.equal(spotify.parseSpotifyPlaylistId(playlistId), playlistId);
  assert.equal(spotify.parseSpotifyPlaylistId(`https://spotify.example/playlist/${playlistId}`), null);
  assert.equal(spotify.parseSpotifyPlaylistId('not a playlist'), null);
});

test('accepts plausible public Spotify client IDs without accepting arbitrary text', () => {
  assert.equal(spotify.normalizeSpotifyClientId(' 0123456789abcdef0123456789abcdef '), '0123456789abcdef0123456789abcdef');
  assert.equal(spotify.normalizeSpotifyClientId('too-short'), null);
  assert.equal(spotify.normalizeSpotifyClientId('contains spaces and punctuation!'), null);
});

test('uses an exact production redirect and converts localhost to Spotify-supported loopback IP', () => {
  assert.equal(spotify.spotifyRedirectUri({ origin: 'https://ai.rhyslindmark.com', pathname: '/music' }), 'https://ai.rhyslindmark.com/music');
  assert.equal(spotify.spotifyRedirectUri({ origin: 'http://localhost:4335', pathname: '/' }), 'http://127.0.0.1:4335/');
});

test('builds a PKCE authorization URL with the minimum read scopes', async () => {
  const url = new URL(await spotify.createSpotifyAuthorization({
    clientId: 'client-id', redirectUri: 'https://example.com/music', state: 'state-token', verifier: 'v'.repeat(64), subtle: crypto.subtle,
  }));
  assert.equal(url.origin, 'https://accounts.spotify.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/music');
  assert.equal(url.searchParams.get('scope'), 'playlist-read-private playlist-read-collaborative');
});

test('imports both 2026 item and legacy track response shapes across pages', async () => {
  const calls = [];
  const pages = [
    { total: 3, next: 'next', items: [fixture('first', 'item'), fixture('second', 'track')] },
    { total: 3, next: null, items: [{ is_local: true, item: { id: 'local', type: 'track' } }] },
  ];
  const result = await spotify.fetchSpotifyPlaylistRows({
    playlistId, accessToken: 'token',
    fetcher: async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.Authorization });
      return new Response(JSON.stringify(pages.shift()), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.requests, 2);
  assert.equal(result.rows[0]['Track Name'], 'first');
  assert.equal(result.rows[1]['Spotify Track ID'], idFor('second'));
  assert.equal(calls[0].authorization, 'Bearer token');
  assert.match(calls[1].url, /offset=2/);
});

test('fetches known remaining pages with bounded overlap and preserves playlist order', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const delays = new Map([[0, 1], [50, 30], [100, 5], [150, 15]]);
  const result = await spotify.fetchSpotifyPlaylistRows({
    playlistId, accessToken: 'token', paginationConcurrency: 3,
    fetcher: async (url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delays.get(offset)));
      inFlight -= 1;
      return new Response(JSON.stringify({
        total: 200,
        offset,
        limit: 50,
        next: offset < 150 ? `page-${offset + 50}` : null,
        items: [fixture(`page-${offset}`, 'item')],
      }), { status: 200 });
    },
  });
  assert.equal(maxInFlight, 3);
  assert.equal(result.requests, 4);
  assert.deepEqual(result.rows.map((row) => row['Track Name']), ['page-0', 'page-50', 'page-100', 'page-150']);
});

test('retries a rate-limited page and explains playlist plus development-app access', async () => {
  let attempts = 0;
  const waits = [];
  const result = await spotify.fetchSpotifyPlaylistRows({
    playlistId, accessToken: 'token', wait: async (milliseconds) => waits.push(milliseconds),
    fetcher: async () => {
      attempts += 1;
      if (attempts === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '2' } });
      return new Response(JSON.stringify({ total: 1, next: null, items: [fixture('ready', 'item')] }), { status: 200 });
    },
  });
  assert.deepEqual(waits, [2000]);
  assert.equal(result.rows.length, 1);
  await assert.rejects(() => spotify.fetchSpotifyPlaylistRows({ playlistId, accessToken: 'token', fetcher: async () => new Response('{}', { status: 403 }) }), /app owner or an allowlisted development tester/);
});

test('stops retrying when Spotify keeps returning 429', async () => {
  let attempts = 0;
  await assert.rejects(() => spotify.fetchSpotifyPlaylistRows({
    playlistId, accessToken: 'token', wait: async () => {},
    fetcher: async () => { attempts += 1; return new Response('{}', { status: 429, headers: { 'retry-after': '1' } }); },
  }), /still rate-limiting/);
  assert.equal(attempts, 5);
});

test('Spotify import distinguishes exhausted developer quota from a temporary rate limit', async () => {
  let attempts = 0;
  await assert.rejects(() => spotify.fetchSpotifyPlaylistRows({
    playlistId, accessToken: 'token', wait: async () => {},
    fetcher: async () => {
      attempts += 1;
      return new Response(JSON.stringify({ error: { status: 429, reason: 'QUOTA_EXCEEDED' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    },
  }), /developer quota is exhausted/);
  assert.equal(attempts, 1);
});

function fixture(name, key) {
  const id = idFor(name);
  return { [key]: { id, name, type: 'track', uri: `spotify:track:${id}`, artists: [{ id: 'artist0000000000000000', name: 'Artist' }], album: { id: 'album00000000000000000', name: 'Album', release_date: '2024-01-01' } } };
}

function idFor(value) { return value.padEnd(22, '0').slice(0, 22); }
