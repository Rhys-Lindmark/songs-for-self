import assert from 'node:assert/strict';
import test from 'node:test';
import { observeArtworkVisibility } from '../lib/artwork-visibility.ts';
await test('thousands of artwork targets share visibility observers and remove callbacks on visibility/unmount', () => {
 const original=globalThis.IntersectionObserver;const instances=[];
 globalThis.IntersectionObserver=class {targets=new Set();constructor(callback){this.callback=callback;instances.push(this);}observe(target){this.targets.add(target);}unobserve(target){this.targets.delete(target);}};
 try {
  let shown=0;const targets=Array.from({length:2000},()=>({}));
  const cleanups=targets.map(target=>observeArtworkVisibility(target,visible=>{if(visible)shown+=1;}));
  assert.equal(instances.length,1);assert.equal(instances[0].targets.size,2000);
  instances[0].callback(targets.slice(0,100).map(target=>({target,isIntersecting:true})));
  assert.equal(shown,100);assert.equal(instances[0].targets.size,1900);
  for(const cleanup of cleanups)cleanup();assert.equal(instances[0].targets.size,0);
  let visible=false;const row={};const cleanup=observeArtworkVisibility(row,value=>{visible=value;},false);
  assert.equal(instances.length,2);instances[1].callback([{target:row,isIntersecting:true}]);assert.equal(visible,true);
  instances[1].callback([{target:row,isIntersecting:false}]);assert.equal(visible,false);cleanup();assert.equal(instances[1].targets.size,0);
 }finally{globalThis.IntersectionObserver=original;}
});
