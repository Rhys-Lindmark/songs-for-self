import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const client = path.join(root, 'dist', 'client');
const mountedAssets = path.join(client, 'music', '_next');
const rootAssets = path.join(client, '_next');

if (!fs.existsSync(mountedAssets)) {
  throw new Error(`Expected production framework assets at ${mountedAssets}`);
}

fs.cpSync(mountedAssets, rootAssets, { recursive: true, force: true });
console.log('Mirrored framework assets for both custom-domain and origin-root routing.');
