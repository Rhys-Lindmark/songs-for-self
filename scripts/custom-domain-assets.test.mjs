import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = fs.readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const uploader = fs.readFileSync(new URL('../components/playlist-upload-analyzer.tsx', import.meta.url), 'utf8');
const download = fs.readFileSync(new URL('../components/public-asset-download.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const mirror = fs.readFileSync(new URL('./mirror-framework-assets.mjs', import.meta.url), 'utf8');

await test('production framework assets use the custom-domain mount path', () => {
  assert.match(config, /assetPrefix: process\.env\.NODE_ENV === 'production' \? '\/music'/);
  assert.match(packageJson.scripts.build, /mirror-framework-assets\.mjs/);
  assert.match(mirror, /fs\.cpSync\(mountedAssets, rootAssets/);
});

await test('download links resolve relative to both root and /music deployments', () => {
  assert.match(page, /fileName="songs-for-self-v3\.csv"/);
  assert.match(uploader, /fileName="playlist-upload-template\.csv"/);
  assert.match(download, /publicAssetUrl\(fileName\)/);
  assert.match(download, /onClick=\{\(event\) => resolveHref\(event\.currentTarget\)\}/);
});
