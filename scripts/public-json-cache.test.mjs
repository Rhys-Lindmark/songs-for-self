import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const assetSource = fs.readFileSync(new URL('../lib/public-asset-url.ts', import.meta.url), 'utf8');
const assetCompiled = ts.transpile(assetSource, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const assetUrl = `data:text/javascript;base64,${Buffer.from(assetCompiled).toString('base64')}`;
const cacheSource = fs.readFileSync(new URL('../lib/public-json-cache.ts', import.meta.url), 'utf8').replace("@/lib/public-asset-url", assetUrl);
const cacheCompiled = ts.transpile(cacheSource, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const cacheUrl = `data:text/javascript;base64,${Buffer.from(cacheCompiled).toString('base64')}`;
const cache = await import(cacheUrl);

test('deduplicates parsed public JSON for the active mount path', async () => {
  let calls = 0;
  const fetcher = async (url) => { calls += 1; return new Response(JSON.stringify({ url }), { status: 200 }); };
  const first = cache.loadPublicJson('upload-lookup.json', { fetcher, pathname: '/music' });
  const second = cache.loadPublicJson('upload-lookup.json', { fetcher, pathname: '/music' });
  assert.equal(first, second);
  assert.deepEqual(await first, { url: '/music/upload-lookup.json' });
  assert.equal(calls, 1);
});

test('evicts a failed request so a later import can recover', async () => {
  cache.clearPublicJsonCache();
  let calls = 0;
  const fetcher = async () => new Response(JSON.stringify({ attempt: ++calls }), { status: calls === 1 ? 503 : 200 });
  await assert.rejects(() => cache.loadPublicJson('genre-space-data.json', { fetcher, pathname: '/' }), /could not be loaded/);
  assert.deepEqual(await cache.loadPublicJson('genre-space-data.json', { fetcher, pathname: '/' }), { attempt: 2 });
});
