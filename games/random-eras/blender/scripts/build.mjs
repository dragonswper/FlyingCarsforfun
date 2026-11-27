import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
for (const group of ['knight', 'weapons', 'map-kit', 'era-props', 'ui-art']) {
  const run = spawnSync(process.env.BLENDER ?? 'blender', [
    '--background', '--python-exit-code', '1', '--disable-autoexec', '--threads', '4',
    at(`../src/${group}.blend`), '--python', at('./export.py'), '--', at('../../public/'),
  ], { stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
