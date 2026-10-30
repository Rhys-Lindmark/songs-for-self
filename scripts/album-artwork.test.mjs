import assert from 'node:assert/strict';
import test from 'node:test';
import { configureArtworkCatalogLoader, loadArtworkImage, peekArtworkImage, resolveArtwork, safeArtworkUrl, spotifyThumbnailUrl } from '../lib/album-artwork.ts';

const HASH = '0123456789abcdef01234567';
const LARGE = `https://i.scdn.co/image/ab67616d0000b273${HASH}`;
const FULL = `https://i.scdn.co/image/ab67616d00001e02${HASH}`;
const SMALL = `https://i.scdn.co/image/ab67616d00004851${HASH}`;
const albumId = (index) => String(index).padStart(22, '0');
const emptyCatalog = () => Promise.resolve({ version: 1, albums: {} });
const response = (thumbnail_url = FULL) => new Response(JSON.stringify({ thumbnail_url }));

await test('known Spotify image hashes resolve to real 64px/300px variants on approved HTTPS hosts', () => {
  for (const host of ['i.scdn.co','image-cdn-fa.spotifycdn.com','image-cdn-ak.spotifycdn.com']) for (const code of ['b273','1e02','4851']) {
    const url = `https://${host}/image/ab67616d0000${code}${HASH}`;
    assert.equal(spotifyThumbnailUrl(url), `https://${host}/image/ab67616d00004851${HASH}`);
    assert.equal(spotifyThumbnailUrl(url,'full'), `https://${host}/image/ab67616d00001e02${HASH}`);
  }
});
await test('unrecognized paths, fixtures, unknown hosts, and other protocols are not rewritten', () => {
  for (const url of ['https://i.scdn.co/image/verified-cover','https://covers.example/album.svg',`https://unknown.spotifycdn.com/image/ab67616d0000b273${HASH}`,`https://i.scdn.co.example/image/ab67616d0000b273${HASH}`,`http://i.scdn.co/image/ab67616d0000b273${HASH}`,`https://user:pass@i.scdn.co/image/ab67616d0000b273${HASH}`,`https://i.scdn.co:8443/image/ab67616d0000b273${HASH}`]) assert.equal(spotifyThumbnailUrl(url),url);
  assert.equal(spotifyThumbnailUrl(`${FULL}?example=1#cover`), `${SMALL}?example=1#cover`);
});
await test('artwork lookup deduplicates albums and bounds concurrent Spotify requests', async () => {
  configureArtworkCatalogLoader(emptyCatalog);
  const original = globalThis.fetch;
  let active = 0; let peak = 0; let requests = 0;
  globalThis.fetch = async () => {
    requests += 1; active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1;
    return response();
  };
  try {
    const sources = Array.from({ length: 12 }, (_, index) => ({ spotifyAlbumId: albumId(index) }));
    const results = await Promise.all([...sources, ...sources].map((source) => resolveArtwork(source)));
    assert.equal(requests, 12); assert.ok(peak <= 4); assert.ok(results.every((result) => result === SMALL));
  } finally { globalThis.fetch = original; }
});
await test('a static catalog is loaded once, bypasses oEmbed, and shares metadata across both resolutions', async () => {
  let loads = 0; let fetches = 0;
  const original = globalThis.fetch;
  configureArtworkCatalogLoader(async () => { loads += 1; return { version: 1, albums: { [albumId(40)]: LARGE, [albumId(41)]: FULL } }; });
  globalThis.fetch = async () => { fetches += 1; throw new Error('oEmbed should not run for catalog hits'); };
  try {
    const results = await Promise.all([resolveArtwork({spotifyAlbumId:albumId(40)}),resolveArtwork({spotifyAlbumId:albumId(40)},false,'full'),resolveArtwork({spotifyAlbumId:albumId(41),coverUrl:'https://coverartarchive.org/release-group/example/front-250'})]);
    assert.deepEqual(results,[SMALL,FULL,SMALL]);assert.equal(loads,1);assert.equal(fetches,0);
  } finally { globalThis.fetch = original; }
});
await test('explicit non-archive covers stay immediate, while archive URLs remain a real fallback', async () => {
  let loads = 0;
  configureArtworkCatalogLoader(async () => { loads += 1; return {version:1,albums:{[albumId(42)]:FULL}}; });
  assert.equal(await resolveArtwork({coverUrl:'https://covers.example/custom.svg',spotifyAlbumId:albumId(42)}),'https://covers.example/custom.svg');
  assert.equal(await resolveArtwork({coverUrl:FULL,spotifyAlbumId:albumId(42)}),SMALL);
  assert.equal(await resolveArtwork({coverUrl:'https://coverartarchive.org/cover.jpg',spotifyAlbumId:albumId(42)},true),'https://coverartarchive.org/cover.jpg');
  assert.equal(loads,0);
});
await test('catalog failure is stable and falls through to a deduplicated network resolution', async () => {
  let loads = 0; let fetches = 0;
  const original = globalThis.fetch;
  configureArtworkCatalogLoader(async () => { loads += 1; throw new Error('Unavailable catalog'); });
  globalThis.fetch = async () => { fetches += 1; return response(); };
  try {
    const source = {spotifyAlbumId:albumId(43)};
    assert.deepEqual(await Promise.all([resolveArtwork(source),resolveArtwork(source,false,'full')]),[SMALL,FULL]);
    assert.equal(await resolveArtwork(source),SMALL);assert.equal(loads,1);assert.equal(fetches,1);
  } finally {globalThis.fetch=original;}
});
await test('catalog waits are bounded and late resolution cannot replace the cached failure', async (t) => {
  t.mock.timers.enable({apis:['setTimeout']});
  let loads = 0; let fetches = 0; let complete;
  const original=globalThis.fetch;
  configureArtworkCatalogLoader(() => {loads+=1;return new Promise((resolve)=>{complete=resolve;});});
  globalThis.fetch=async()=>{fetches+=1;return response();};
  try {
    const pending=resolveArtwork({spotifyAlbumId:albumId(44)});
    await Promise.resolve(); t.mock.timers.tick(2001);
    assert.equal(await pending,SMALL);
    complete({version:1,albums:{[albumId(45)]:LARGE}});await Promise.resolve();await Promise.resolve();
    assert.equal(await resolveArtwork({spotifyAlbumId:albumId(45)}),SMALL);assert.equal(loads,1);assert.equal(fetches,2);
  } finally {globalThis.fetch=original;t.mock.timers.reset();}
});
await test('untrusted catalog values and malformed catalog schemas fall back without serving unknown hosts', async () => {
  const original=globalThis.fetch;let fetches=0;
  globalThis.fetch=async()=>{fetches+=1;return response();};
  try {
    configureArtworkCatalogLoader(async()=>({version:1,albums:{[albumId(46)]:'https://untrusted.example/cover.jpg',[albumId(47)]:`https://user:password@i.scdn.co/image/ab67616d00001e02${HASH}`}}));
    assert.equal(await resolveArtwork({spotifyAlbumId:albumId(46)}),SMALL);
    assert.equal(await resolveArtwork({spotifyAlbumId:albumId(47)}),SMALL);
    configureArtworkCatalogLoader(async()=>({version:2,albums:{[albumId(48)]:FULL}}));
    assert.equal(await resolveArtwork({spotifyAlbumId:albumId(48)}),SMALL);assert.equal(fetches,3);
  }finally{globalThis.fetch=original;}
});
await test('network failures and untrusted oEmbed URLs remain cached failures, with archive fallback intact',async()=>{
  const original=globalThis.fetch;let fetches=0;
  configureArtworkCatalogLoader(emptyCatalog);
  globalThis.fetch=async()=>{fetches+=1;return new Response('{}',{status:404});};
  try{
    const source={spotifyAlbumId:albumId(50)};
    assert.equal(await resolveArtwork(source),null);assert.equal(await resolveArtwork(source),null);assert.equal(fetches,1);
    const archive={spotifyAlbumId:albumId(51),coverUrl:'https://coverartarchive.org/archive.jpg'};
    assert.equal(await resolveArtwork(archive),'https://coverartarchive.org/archive.jpg');
    globalThis.fetch=async()=>response('https://untrusted.example/cover.jpg');
    assert.equal(await resolveArtwork({spotifyTrackId:'BBBBBBBBBBBBBBBBBBBBBB'}),null);
    globalThis.fetch=async()=>response(`https://i.scdn.co:8443/image/ab67616d00001e02${HASH}`);
    assert.equal(await resolveArtwork({spotifyTrackId:'CCCCCCCCCCCCCCCCCCCCCC'}),null);
  }finally{globalThis.fetch=original;}
});
await test('a failed explicit direct cover can still use the normal oEmbed fallback',async()=>{
  const original=globalThis.fetch;let loads=0;let fetches=0;
  configureArtworkCatalogLoader(async()=>{loads+=1;return{version:1,albums:{[albumId(52)]:FULL}};});
  globalThis.fetch=async()=>{fetches+=1;return response();};
  try{assert.equal(await resolveArtwork({coverUrl:'https://covers.example/broken.jpg',spotifyAlbumId:albumId(52)},true),SMALL);assert.equal(loads,0);assert.equal(fetches,1);}finally{globalThis.fetch=original;}
});
await test('resolved URL storage is bounded to2048 entries while in-flight duplicates remain shared',async()=>{
  const original=globalThis.fetch;let fetches=0;
  configureArtworkCatalogLoader(emptyCatalog);
  globalThis.fetch=async()=>{fetches+=1;return response();};
  try{
    const sources=Array.from({length:2050},(_,index)=>({spotifyAlbumId:albumId(10_000+index)}));
    await Promise.all([...sources,sources[0]].map((source)=>resolveArtwork(source)));
    assert.equal(fetches,2050);
    await resolveArtwork(sources.at(-1));assert.equal(fetches,2050);
    await resolveArtwork(sources[0]);assert.equal(fetches,2051);
  }finally{globalThis.fetch=original;}
});
await test('canvas image loading defaults to64px and keeps decoded/in-flight images shared',async()=>{
  const originalImage=globalThis.Image;const originalWindow=globalThis.window;
  configureArtworkCatalogLoader(emptyCatalog);
  let loads=0;
  globalThis.window={setTimeout:globalThis.setTimeout};
  globalThis.Image=class{
    set src(value){this.value=value;if(value){loads+=1;queueMicrotask(()=>this.onload?.());}}
    get src(){return this.value;}
  };
  try{
    const source={coverUrl:FULL};
    const [one,two]=await Promise.all([loadArtworkImage(source),loadArtworkImage(source)]);
    assert.equal(one,two);assert.equal(one.src,SMALL);assert.equal(loads,1);assert.equal(peekArtworkImage(source),one);
    assert.equal(await loadArtworkImage(source),one);assert.equal(loads,1);
  }finally{if(originalImage===undefined)delete globalThis.Image;else globalThis.Image=originalImage;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
});
await test('artwork handles missing metadata, bad URLs, and custom fixture paths without changing them',async()=>{
  assert.equal(safeArtworkUrl('javascript:alert(1)'),null);assert.equal(await resolveArtwork({}),null);
  assert.equal(await resolveArtwork({coverUrl:'https://i.scdn.co/image/direct-cover'}),'https://i.scdn.co/image/direct-cover');
  assert.equal(await resolveArtwork({coverUrl:'http://untrusted.example/cover.jpg'}),null);
});

await test('a failed catalog image can request fresh oEmbed metadata rather than repeat its stale URL',async()=>{
  const original=globalThis.fetch;let fetches=0;let loads=0;
  const newer=`https://i.scdn.co/image/ab67616d00001e02${'abcdef0123456789abcdef01'}`;
  configureArtworkCatalogLoader(async()=>{loads+=1;return{version:1,albums:{[albumId(60)]:FULL}};});
  globalThis.fetch=async()=>{fetches+=1;return response(newer);};
  try{
    assert.equal(await resolveArtwork({spotifyAlbumId:albumId(60)}),SMALL);
    assert.equal(await resolveArtwork({spotifyAlbumId:albumId(60)},true),spotifyThumbnailUrl(newer));
    assert.equal(loads,1);assert.equal(fetches,1);
  }finally{globalThis.fetch=original;}
});
