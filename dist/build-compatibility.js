import {NET_BUILD} from './network-protocol.js';

// These releases share the same simulation, car catalog and binary state schema.
// Remove legacy entries whenever those rules or the wire format change. Tests
// pin the shared gameplay files to the legacy release's hashes.
export const COMPATIBLE_BUILDS = Object.freeze([
  NET_BUILD,
  'boost-circuit-1.28.2',
  'boost-circuit-1.28.1',
  'boost-circuit-1.28.0',
  'boost-circuit-1.27.0',
]);
export const compatibleBuild = (build) =>
  typeof build === 'string' && COMPATIBLE_BUILDS.includes(build);
const label = (build) =>
  /^boost-circuit-\d+\.\d+\.\d+$/.test(build)
    ? build.replace('boost-circuit-', 'v')
    : 'an unknown version';
export function versionMismatch(serverBuild) {
  const error = new Error(
    `This game is ${label(NET_BUILD)}; the selected server is ${label(serverBuild)}. Reload the game for its latest update, or choose an updated server in Connection & Ping Settings.`,
  );
  error.code = 'VERSION_MISMATCH';
  error.serverBuild = serverBuild;
  return error;
}
export function reloadGame(location = globalThis.location) {
  const url = new URL(location.href);
  url.searchParams.set('_update', NET_BUILD);
  location.replace(url.href);
}
