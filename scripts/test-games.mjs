import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const suites = [
  ['riftfall', ['tests/server.test.mjs']],
  [
    'skybreak',
    [
      'tests/server.test.mjs',
      'tests/simulation.test.mjs',
      'tests/assets.test.mjs',
    ],
  ],
  [
    'random-eras',
    readdirSync(new URL('../games/random-eras/test/', import.meta.url))
      .filter((name) => name.endsWith('.test.js'))
      .map((name) => 'test/' + name),
  ],
];
for (const [id, files] of suites) {
  console.log(`\nTesting ${id}`);
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: fileURLToPath(new URL('games/' + id + '/', root)),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
