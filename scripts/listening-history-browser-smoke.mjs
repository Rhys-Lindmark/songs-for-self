import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://127.0.0.1:4329';
const event = (name, artist, album, ts, ms = 180000) => ({ ts, ms_played: ms, master_metadata_track_name: name, master_metadata_album_artist_name: artist, master_metadata_album_album_name: album, spotify_track_uri: null, ip_addr: '203.0.113.55', username: 'private-fixture-username', platform: 'private-device-fixture', conn_country: 'PRIVATE-COUNTRY-FIXTURE' });
const jazz = Array.from({ length: 8 }, (_, index) => event('So What', 'Miles Davis', 'Kind of Blue', `2010-01-0${index + 1}T12:00:00Z`));
const rock = Array.from({ length: 3 }, (_, index) => event('Come Together', 'The Beatles', 'Abbey Road', `2026-10-0${index + 1}T12:00:00Z`));
const files = [
  { name: 'Streaming_History_Audio_A.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([...jazz, { ts:'2010-01-01T00:00:00Z', ms_played: 1000, episode_name:'A podcast', spotify_episode_uri:'spotify:episode:1234567890123456789012' }, event('Zero', 'Unknown', '', '2010-01-01T00:00:00Z', 0), {ts:'wrong',ms_played:1,master_metadata_track_name:'Invalid'}])) },
  { name: 'Streaming_History_Audio_B.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([...rock,event('Uncatalogued history fixture', 'Uncatalogued history artist XYZ', '', '2026-10-30T12:00:00Z',5),jazz[0]])) },
];
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined), headless: true });
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion:'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(25_000);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    const privateRequests = []; page.on('request', (request) => { if (/203\.0\.113\.55|private-fixture-username|private-device-fixture|PRIVATE-COUNTRY-FIXTURE/.test(request.url() + (request.postData() || ''))) privateRequests.push(request.url()); });
    await page.route('https://open.spotify.com/oembed**', (route) => route.fulfill({contentType:'application/json',body:JSON.stringify({thumbnail_url:'https://i.scdn.co/image/history-fixture'})}));
    await page.route('https://i.scdn.co/**', (route) => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#346753"/></svg>'}));
    await page.route('https://coverartarchive.org/**', (route) => route.abort());
    await page.goto(baseUrl, { waitUntil:'networkidle' });
    await page.getByLabel('Data to analyze', {exact:true}).selectOption('history');
    assert.match(await page.locator('#your-playlist').innerText(), /Extended Streaming History/);
    await page.locator('input[type="file"]').setInputFiles(files);
    const history = page.getByRole('region', {name:'Listening history summary',exact:true});
    try { await history.getByRole('heading', {name:'Your listening history',exact:true}).waitFor(); }
    catch (cause) { console.error(JSON.stringify({width,errors,alerts:await page.getByRole('alert').allTextContents(),body:(await page.locator('#your-playlist').innerText()).slice(-6000)})); throw cause; }
    assert.match(await history.innerText(), /12 recorded plays · 3 unique tracks/);
    assert.match(await history.innerText(), /Jan 1, 2010.*Oct 30, 2026.*2 extended history files/);
    await history.getByText('History import details', {exact:true}).click();
    assert.match(await history.innerText(), /1 overlapping records removed · 1 non-music records excluded · 1 zero-duration records excluded · 1 invalid records excluded/);
    const profile = page.getByRole('region', {name:'Playlist genre profile',exact:true});
    assert.match(await profile.getByRole('list').getByRole('listitem').first().innerText(), /Jazz.*66\.7%/s);
    assert.match(await profile.innerText(), /Jazz stands out in your listening history/);
    const basis = profile.getByLabel('Genre share basis', {exact:true});
    await basis.selectOption('tracks');
    assert.match(await profile.innerText(), /Shares use all 3 unique tracks/);
    assert.match(await profile.getByRole('list').innerText(), /33\.3%/);
    await basis.selectOption('plays');
    const albumScore = page.getByRole('heading', {name:"You've explored 2/500 critically acclaimed albums",exact:true});
    await albumScore.waitFor();
    if (process.env.SFS_HISTORY_SCREENSHOT && width === 1280) await page.locator('#your-playlist').screenshot({path:process.env.SFS_HISTORY_SCREENSHOT,style:'.skip-link { visibility:hidden !important; }'});
    for (const view of ['Time','Genre space','Geography']) {
      await page.getByRole('button',{name:view,exact:true}).click();
      assert.match(await history.innerText(), /12 recorded plays/);
      await albumScore.waitFor();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    // Only sanitized aggregates should survive in IndexedDB, with no raw network/device identifiers.
    const snapshot = await page.evaluate(async () => {
      const database = await new Promise((resolve,reject) => { const request=indexedDB.open('songs-for-self-browser-data');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
      try { return await new Promise((resolve,reject) => { const request=database.transaction('playlist-analyses','readonly').objectStore('playlist-analyses').get('latest');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); }); }
      finally { database.close(); }
    });
    assert.equal(snapshot.tracks.find((track)=>track.artist==='Miles Davis').year,1959, 'Listening dates must not replace the recording-year inference');
    assert.equal(snapshot.tracks.length, 3); assert.equal(snapshot.listeningHistory.events, 12);
    assert.equal(snapshot.tracks.reduce((sum,track)=>sum+track.listening.plays,0),12);
    assert.doesNotMatch(JSON.stringify(snapshot), /203\.0\.113\.55|private-fixture-username|private-device-fixture|PRIVATE-COUNTRY-FIXTURE|ip_addr|conn_country/);
    assert.deepEqual(privateRequests,[]);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Resume atlas',exact:true}).click();
    await history.getByRole('heading',{name:'Your listening history',exact:true}).waitFor();
    assert.match(await profile.getByRole('list').innerText(), /66\.7%/);
    await page.getByRole('button',{name:'Clear playlist',exact:true}).click();
    assert.equal(await history.count(),0);
    await page.waitForFunction(async () => {
      const database = await new Promise((resolve,reject) => { const request=indexedDB.open('songs-for-self-browser-data');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
      try { return await new Promise((resolve,reject) => { const request=database.transaction('playlist-analyses','readonly').objectStore('playlist-analyses').get('latest');request.onsuccess=()=>resolve(request.result===undefined);request.onerror=()=>reject(request.error); }); }
      finally { database.close(); }
    });
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('button',{name:'Resume atlas',exact:true}).count(),0);
    // A basic past-year export works through the ordinary file chooser too.
    await page.locator('input[type="file"]').setInputFiles({name:'StreamingHistory0.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{endTime:'2026-01-01 12:00',artistName:'Miles Davis',trackName:'So What',msPlayed:180000}]))});
    await history.getByRole('heading',{name:'Your listening history',exact:true}).waitFor();
    await history.getByText('History import details',{exact:true}).click();
    assert.match(await history.innerText(), /Standard history usually covers the past year and lacks album names and track IDs/);
    await page.getByRole('button',{name:'Clear playlist',exact:true}).click();
    const broadHistory = Array.from({length:250},(_,index)=>event(`Uncatalogued large-history song ${index}`,'Uncatalogued large-history artist XYZ',`Uncatalogued album ${index}`,'2026-01-01T00:00:00Z'));
    await page.locator('input[type="file"]').setInputFiles({name:'Streaming_History_Audio_Large.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broadHistory))});
    await history.getByText(/250 recorded plays · 250 unique tracks/).waitFor();
    const collection = page.getByRole('region',{name:'Your album collection. Scroll to explore all albums.',exact:true});
    assert.equal(await collection.getByRole('button').count(),240,'Large history must not mount every cover at once');
    await page.getByRole('button',{name:'Show 240 more albums',exact:true}).click();
    assert.equal(await collection.getByRole('button').count(),250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),width);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`Full history multi-file import, overlap/skip accounting, play weighting, unique coverage, all views, private aggregate storage, resume/clear and basic fallback passed at ${width}px.`);
  }
} finally { await browser.close(); }
