import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const baseUrl=process.env.SFS_BASE_URL || 'http://127.0.0.1:4329';
const baseline=process.env.SFS_PERF_BASELINE === '1';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || (existsSync(chrome)?chrome:undefined),headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(30000);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Network.enable');
 const requests=new Map();let bytes=0;let imageBytes=0;
 cdp.on('Network.responseReceived',e=>{const r=requests.get(e.requestId);if(r){r.mime=e.response.mimeType;r.status=e.response.status;}});
 cdp.on('Network.requestWillBeSent',e=>requests.set(e.requestId,{url:e.request.url}));
 cdp.on('Network.loadingFinished',e=>{bytes+=e.encodedDataLength;if(requests.get(e.requestId)?.mime?.startsWith('image/'))imageBytes+=e.encodedDataLength;});
 await page.addInitScript(()=>{window.__timelinePerf={longTasks:[],observers:0};const O=window.IntersectionObserver;window.IntersectionObserver=class extends O{constructor(...args){super(...args);window.__timelinePerf.observers+=1;}};new PerformanceObserver(list=>window.__timelinePerf.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});});
 const started=Date.now();await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 const timeline=page.getByRole('region',{name:'Genre timeline. Swipe or scroll horizontally to move through musical time.',exact:true});await timeline.waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label^="Genre timeline"] button'));
 await timeline.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-10));
 const visibleAt=Date.now()-started;await page.waitForTimeout(4000);
 const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
 const dom=await timeline.evaluate(el=>({artwork:el.querySelectorAll('[data-album-artwork]').length,ready:el.querySelectorAll('[data-artwork-status="ready"]').length,loaded:[...el.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0).length,dimensions:[...el.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0).slice(0,20).map(i=>({width:i.naturalWidth,height:i.naturalHeight,url:i.currentSrc})),elements:el.querySelectorAll('*').length,buttons:el.querySelectorAll('button').length}));
 const perf=await page.evaluate(()=>window.__timelinePerf);
 const result={baseUrl,baseline,timelineVisibleMs:visibleAt,...dom,intersectionObservers:perf.observers,longTaskCount:perf.longTasks.length,longTaskTotalMs:Math.round(perf.longTasks.reduce((a,b)=>a+b,0)),longestTaskMs:Math.round(Math.max(0,...perf.longTasks)),requests:requests.size,oembedRequests:[...requests.values()].filter(x=>x.url.includes('/oembed')).length,imageBytes,totalEncodedBytes:bytes,scriptDurationSeconds:metrics.ScriptDuration,layoutDurationSeconds:metrics.LayoutDuration,jsHeapBytes:metrics.JSHeapUsedSize};
 console.log(JSON.stringify(result,null,2));if(process.env.SFS_PERF_OUTPUT)writeFileSync(process.env.SFS_PERF_OUTPUT,JSON.stringify(result,null,2)+'\n');
 if(!baseline){assert.ok(dom.artwork>0&&dom.artwork<1500,'Only nearby timeline artwork should be mounted');assert.ok(dom.loaded>=10,'The timeline should show real loaded thumbnails promptly');assert.ok(result.oembedRequests<=4,'Reference timeline thumbnails should bypass serial Spotify lookups');assert.ok(dom.dimensions.filter(i=>i.width<=64&&i.height<=64).length>=dom.dimensions.length*.9,'Timeline must primarily use small artwork assets; legacy encodings retain real-art fallback');assert.ok(result.intersectionObservers<=8,'Visibility observers must be shared');}
 if(process.env.SFS_PERF_SCREENSHOT)await page.screenshot({path:process.env.SFS_PERF_SCREENSHOT,style:'.skip-link {visibility:hidden!important}'});
 // Moving vertically and horizontally must reveal the correct albums without page overflow.
 await page.setViewportSize({width:320,height:900});await timeline.evaluate(el=>{window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-10);el.scrollLeft=el.scrollWidth;});
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
 await timeline.getByRole('button',{name:'Show Classical before 1900',exact:true}).click();
 const history=timeline.getByRole('region',{name:'Classical before 1900',exact:true});await history.waitFor();assert.ok(await history.getByRole('button').count()>0);
 await history.getByRole('button').first().focus();await page.keyboard.press('Enter');
 const detail=page.getByRole('complementary').filter({hasText:'Album memories'});await detail.waitFor();
 if(!baseline){const image=detail.locator('img').first();await detail.scrollIntoViewIfNeeded();await image.waitFor();await image.evaluate(image=>new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth>0)return resolve();const timeout=setTimeout(()=>reject(new Error('Selected artwork timed out')),10000);image.addEventListener('load',()=>{clearTimeout(timeout);resolve();},{once:true});image.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('Selected artwork failed'));},{once:true});}));assert.ok(await image.evaluate(image=>image.naturalWidth>=250),'Full artwork should load only when selected');}

 console.log('Timeline pan, Classical disclosure, keyboard selection and mobile overflow passed.');
}finally{await browser.close();}
