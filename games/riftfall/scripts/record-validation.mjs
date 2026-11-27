import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['browser', 'integration', 'world'];
const results = await Promise.all(names.map(async name => JSON.parse(await readFile(path.join(root, 'test-results', `${name}-results.json`), 'utf8'))));
for (let i = 0; i < results.length; i++) if (!results[i].passed) throw new Error(`${names[i]} verification did not pass; do not record it as successful.`);
let markdown = '# Verification\n\nVerified on Windows in headless Microsoft Edge with software WebGL rendering. These checks establish the prototype behaviors listed below; they do not establish performance on every GPU or compatibility with the user’s unsupplied launcher.\n\nThe Node HTTP-server test also passed: static game assets, HEAD responses, invalid URLs, traversal attempts and non-read methods.\n';
for (let i = 0; i < names.length; i++) {
  const result = results[i];
  markdown += `\n## ${names[i] === 'browser' ? 'Browser gameplay' : names[i] === 'integration' ? 'Launcher frame and origins' : 'Controlled world simulation'}\n\n`;
  for (const check of result.checks || result.results.map(item => item.name)) markdown += `- ${check}\n`;
  if (result.scope) markdown += `\nScope: ${result.scope}\n`;
}
markdown += '\nThe browser gameplay session reported no uncaught JavaScript errors and no external asset requests. Outfits, sensitivity, quality, sound preference and personal best use optional local browser storage. Keyboard and mouse gameplay is implemented; mobile touch controls and online multiplayer are not.\n\nThe standalone assets are in `dist/`. The launcher demonstration is `dist/launcher-example.html`. The actual launcher source was not supplied; its direct integration remains unverified.\n\nREA help and Magnesium static archive inspection exited successfully; see `archive-assessment.md`, `rea-help.txt` and `rea-magnesium.json`. No Fortnite executable or Magnesium DLL was run.\n';
await writeFile(path.join(root, 'docs', 'verification.md'), markdown);
console.log('Recorded successful browser, launcher and controlled simulation verification.');
