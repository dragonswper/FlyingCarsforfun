// Stable public entry point for Node deployments and existing integrations.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export {createGameServer, ServerSession} from './adapters/node.mjs';
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const {runServer} = await import('./cli.mjs');
  await runServer();
}
