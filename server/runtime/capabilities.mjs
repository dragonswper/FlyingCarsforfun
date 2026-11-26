// Add new modes to shared rules first; adapters advertise the same contract.
import {SERVER_MODES} from '../../dist/server-options.js';
export const CAPABILITIES = Object.freeze({
  protocol: 1,
  physicsHz: 120,
  snapshotHz: 30,
  inputHz: 60,
  modes: SERVER_MODES,
  maxPlayers: 8,
  reconnectSeconds: 20,
  features: Object.freeze([
    'private-lobbies',
    'matchmaking',
    'spectating',
    'chat',
    'friends',
    'reconnect',
    'binary-snapshots',
    'member-invites',
    'lobby-appearance',
    'party-matchmaking',
    'private-mutators',
    'hoops',
    'adaptive-snapshots',
  ]),
});
