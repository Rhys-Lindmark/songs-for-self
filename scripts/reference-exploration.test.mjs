import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const summary=read('../data/reference-exploration.json');
const details=read('../public/reference-exploration.json');
await test('default collection summaries include all source tracks and a small initial genre profile',()=>{
 const expected=read('../data/viz-summary.json').activeTracks;
 assert.equal(summary.tracks,expected);assert.equal(details.tracks.length,expected);assert.equal(summary.profile.total,expected);
 assert.equal(summary.profile.broad.length,10);assert.equal(summary.profile.detailed.length,10);
 for(const row of summary.profile.broad){assert.equal(row.count,details.tracks.filter(track=>track.genre===row.label).length);assert.ok(Math.abs(row.share-row.count/expected*100)<1e-8);}
 assert.ok(fs.statSync(new URL('../data/reference-exploration.json',import.meta.url)).size<20000,'First-load score data must remain compact');
});
await test('precomputed map and album scores retain complete valid evidence for the reference browsers',()=>{
 for(const [kind,key,total] of [['music','areas',1000],['albums','albums',500]]){
  const snapshot=details[kind];const ids=new Set(snapshot.catalog[key].map(row=>row.id));
  const covered=new Set(snapshot.result.matches.map(match=>kind==='music'?match.areaId:match.albumId));
  assert.equal(snapshot.result.total,total);assert.equal(ids.size,total);assert.equal(summary[kind].covered,covered.size);
  assert.equal(summary[kind].covered,snapshot.result.covered);assert.equal(snapshot.result.matches.length+snapshot.result.unmatched.length,details.tracks.length);
  for(const match of snapshot.result.matches){assert.ok(Number.isInteger(match.trackIndex)&&match.trackIndex>=0&&match.trackIndex<details.tracks.length);assert.ok(ids.has(kind==='music'?match.areaId:match.albumId));}
 }
});
