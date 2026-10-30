import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { spotifyThumbnailUrl } from '../lib/album-artwork.ts';
await test('reference thumbnails are pre-resolved public metadata with trusted small Spotify images',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../public/album-thumbnails.json',import.meta.url)));
 const timeline=JSON.parse(fs.readFileSync(new URL('../public/timeline-data.json',import.meta.url)));
 const ids=new Set(timeline.timeline.flatMap(point=>point.albums.map(album=>album.spotifyAlbumId).filter(Boolean)));
 assert.equal(catalog.version,1);assert.ok(Object.keys(catalog.albums).length>=ids.size*.95,'Reference album artwork must be prepared before publishing');
 assert.ok(Object.values(catalog.albums).filter(value=>value.includes('/ab67616d00004851')).length>=Object.keys(catalog.albums).length*.99,'Nearly all reference covers should have small variants');
 for(const [id,value] of Object.entries(catalog.albums)){assert.ok(ids.has(id));assert.match(id,/^[A-Za-z0-9]{22}$/);const url=new URL(value);assert.equal(url.protocol,'https:');assert.ok(['i.scdn.co','image-cdn-fa.spotifycdn.com','image-cdn-ak.spotifycdn.com'].includes(url.hostname));assert.match(url.pathname,/^\/image\/[0-9a-f]{40}$/i);assert.equal(spotifyThumbnailUrl(value),value,'Known encodings must already be the small variant');}
});
