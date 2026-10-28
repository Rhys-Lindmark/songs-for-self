import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const output = path.join(root, 'dist');

if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error(`Refusing to clean unexpected build output: ${output}`);
}

fs.rmSync(output, { recursive: true, force: true });
console.log(`Cleaned generated build output: ${output}`);
