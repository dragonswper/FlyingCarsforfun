import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, 'games/manifest.json')),
);
const target = path.join(root, 'dist/games');
await mkdir(target, {recursive: true});
const hash = (data) => createHash('sha256').update(data).digest('hex');
const report = [];
let sharedEngine;

for (const game of manifest.games) {
  // Build inputs are deliberately restricted to a named game, never shell text.
  if (
    !/^[a-z][a-z0-9-]*$/.test(game.id) ||
    game.source !== `games/${game.id}/dist` ||
    !['static', 'vite'].includes(game.kind)
  )
    throw Error('Invalid game build entry');
  if (game.kind === 'vite') {
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--base=./'],
      {cwd: path.join(root, 'games', game.id), stdio: 'inherit'},
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`${game.title} build failed`);
  }
  const source = path.join(root, game.source);
  const output = path.join(target, game.id);
  await rm(output, {recursive: true, force: true});
  await cp(source, output, {
    recursive: true,
    filter: (name) =>
      !['launcher-example.html', 'app-meta.json', '.DS_Store'].includes(
        path.basename(name),
      ),
  });
  let html = await readFile(path.join(output, 'index.html'), 'utf8');

  if (['riftfall', 'skybreak'].includes(game.id)) {
    const bytes = await readFile(path.join(source, 'vendor/babylon.js'));
    if (sharedEngine && hash(sharedEngine) !== hash(bytes))
      throw Error('Different Babylon versions must not share an engine URL');
    if (!sharedEngine) {
      sharedEngine = bytes;
      const shared = path.join(target, 'shared/babylon8');
      await mkdir(shared, {recursive: true});
      await writeFile(path.join(shared, 'babylon.js'), bytes);
      await cp(
        path.join(source, 'vendor/BABYLON-LICENSE.txt'),
        path.join(shared, 'BABYLON-LICENSE.txt'),
      );
      await cp(path.join(source, 'vendor/BABYLON-NOTICE.txt'), path.join(shared, 'BABYLON-NOTICE.txt'));
    }
    html = html.replace(
      'src="vendor/babylon.js"',
      'src="../shared/babylon8/babylon.js"',
    );
    await rm(path.join(output, 'vendor/babylon.js'));
  }
  // Each game is a top-level page. Keep its native controls and pause UI intact.
  await writeFile(path.join(output, 'index.html'), html);
  const files = [];
  async function inspect(dir) {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) await inspect(name);
      else {
        const bytes = await readFile(name);
        if (bytes.length >= 25 * 1024 * 1024)
          throw Error('An asset exceeds the Cloudflare static-file limit');
        files.push({
          path: path.relative(output, name).replaceAll(path.sep, '/'),
          bytes: bytes.length,
          sha256: hash(bytes),
        });
      }
    }
  }
  await inspect(output);
  report.push({
    id: game.id,
    title: game.title,
    route: `/games/${game.id}/`,
    files,
  });
  console.log(
    `${game.title}: ${files.length} files, ${(files.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(2)} MiB`,
  );
}
await writeFile(
  path.join(root, 'games/runtime-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      games: report,
      sharedEngine: {
        path: '/games/shared/babylon8/babylon.js',
        sha256: hash(sharedEngine),
        bytes: sharedEngine.length,
      },
    },
    null,
    2,
  ) + '\n',
);
