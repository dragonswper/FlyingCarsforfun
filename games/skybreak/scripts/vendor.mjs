import { copyFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist', 'vendor');
await mkdir(destination, { recursive: true });
await copyFile(path.join(root, 'node_modules', 'babylonjs', 'babylon.js'), path.join(destination, 'babylon.js'));
await copyFile(path.join(root, 'node_modules', 'babylonjs', 'NOTICE.md'), path.join(destination, 'BABYLON-NOTICE.txt'));
let copiedLicense = false;
for (const name of ['license.md', 'LICENSE', 'LICENSE.md', 'license.txt']) {
  const candidate = path.join(root, 'node_modules', 'babylonjs', name);
  try {
    await access(candidate);
    await copyFile(candidate, path.join(destination, 'BABYLON-LICENSE.txt'));
    copiedLicense = true;
    break;
  } catch { /* The package uses different license filename across releases. */ }
}
if (!copiedLicense) throw new Error('Babylon license file was not found; do not package without it.');
await copyFile(path.join(root, 'node_modules', 'babylonjs-loaders', 'babylonjs.loaders.min.js'), path.join(destination, 'babylonjs.loaders.min.js'));
console.log('Vendored Babylon.js and its license. The game makes no CDN requests.');
