import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const expected=JSON.parse(readFileSync(new URL('../data/reference-exploration.json',import.meta.url)));
const baseUrl=process.env.SFS_BASE_URL || 'http://127.0.0.1:4329';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || (existsSync(chrome)?chrome:undefined),headless:true});
try {
 for(const width of [1280,320]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const requested=[];page.on('request',request=>requested.push(new URL(request.url()).pathname));
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  const section=page.getByRole('region',{name:'Songs for Self exploration',exact:true});await section.waitFor();
  assert.match(await section.getByLabel('Collection music coverage summary').innerText(),new RegExp(`${expected.music.percent}%`));
  assert.match(await section.getByLabel('Collection acclaimed album summary').innerText(),new RegExp(`${expected.albums.covered} / 500`));
  await section.getByRole('heading',{name:'Your top 10 genres',exact:true}).waitFor();
  assert.equal(await section.getByRole('list',{name:'Top playlist genres',exact:true}).getByRole('listitem').count(),10);
  const box=await section.getByRole('heading',{name:'Your top 10 genres',exact:true}).boundingBox();assert.ok(box.y<900,'Genre summary should be visible without an import');
  assert.deepEqual(requested.filter(url=>/\/(reference-exploration|music-map|artist-genre-index|acclaimed-albums)\.json$/.test(url)),[],'Heavy scoring data must stay deferred on first load');
  if(width===1280&&process.env.SFS_REFERENCE_SCREENSHOT)await section.screenshot({path:process.env.SFS_REFERENCE_SCREENSHOT,style:'.skip-link{visibility:hidden!important}'});
  await section.getByRole('button',{name:'Explore music areas',exact:true}).click();
  const map=section.getByRole('region',{name:'Music map exploration',exact:true});await map.locator('[data-music-area]').first().waitFor();
  assert.equal(await map.locator('[data-music-area]').count(),1000);assert.equal(await map.locator('[data-covered="true"]').count(),expected.music.covered);
  for(const value of ['space','map','time'])await section.getByLabel('Music area arrangement',{exact:true}).selectOption(value);
  await map.getByLabel('Filter music map coverage').selectOption('covered');assert.equal(await map.locator('[data-music-area]').count(),expected.music.covered);
  await section.getByRole('button',{name:'Hide music areas',exact:true}).click();
  await section.getByRole('button',{name:'Explore 500 albums',exact:true}).click();
  const albums=section.getByRole('region',{name:'Acclaimed album exploration',exact:true});await albums.getByLabel('Filter acclaimed album coverage').selectOption('covered');
  assert.match(await albums.innerText(),new RegExp(`${expected.albums.covered} albums match these filters`));
  assert.deepEqual(requested.filter(url=>/\/(music-map|artist-genre-index|acclaimed-albums)\.json$/.test(url)),[],'Reference browsers should reuse snapshots instead of downloading/scoring large catalogs');
  await section.getByRole('button',{name:'Hide acclaimed albums',exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles({name:'reference-replacement.csv',mimeType:'text/csv',buffer:Buffer.from('Track Name,Artist Name(s),Album Name\nReference replacement fixture,Miles Davis,Kind of Blue\n')});
  await page.getByRole('heading',{name:'Explore your music',exact:true}).waitFor();await section.waitFor({state:'detached'});
  await page.getByRole('heading',{name:"You've explored 1/500 critically acclaimed albums",exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Playlist genre profile',exact:true}).count(),1);
  await page.getByRole('button',{name:'Clear playlist',exact:true}).click();await section.waitFor();assert.match(await section.getByLabel('Collection acclaimed album summary').innerText(),new RegExp(`${expected.albums.covered} / 500`));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);assert.deepEqual(errors,[]);await context.close();
  console.log(`Default exploration scores, top10, deferred payload, all area views, album filters, imported replacement and clear passed at ${width}px.`);
 }
 const context=await browser.newContext();const page=await context.newPage();let unavailable=true;await page.route('**/reference-exploration.json',route=>unavailable?route.fulfill({status:503,body:'Unavailable'}):route.continue());
 await page.goto(baseUrl,{waitUntil:'networkidle'});const section=page.getByRole('region',{name:'Songs for Self exploration',exact:true});await section.getByRole('button',{name:'Explore music areas',exact:true}).click();await section.getByRole('button',{name:'Retry exploration details',exact:true}).waitFor();assert.match(await section.getByLabel('Collection music coverage summary').innerText(),new RegExp(`${expected.music.percent}%`));unavailable=false;await section.getByRole('button',{name:'Retry exploration details',exact:true}).click();await section.locator('[data-music-area]').first().waitFor();await context.close();console.log('Default summary remains visible when details fail; retry passed.');
}finally{await browser.close();}
