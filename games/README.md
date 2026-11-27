# One repository, one game host

All Playdock games are now bundled with FlyingCarsforfun. The existing Cloudflare
deployment serves the hub, every client and Boost Circuit's multiplayer service.

| Game | Runtime route | Editable source |
| --- | --- | --- |
| Boost Circuit | `/` | Existing root game and `server/` |
| Playdock hub | `/hub/` | `dist/hub/` |
| Riftfall | `/games/riftfall/` | `games/riftfall/` |
| Skybreak Island | `/games/skybreak/` | `games/skybreak/` |
| Skybreak Classic | `/games/skybreak-classic/` | `games/skybreak-classic/` |
| Random Eras | `/games/random-eras/` | `games/random-eras/` |

The hub uses links on its current origin. Moving the whole deployment to another
HTTPS host therefore keeps the game links together. Players download only the
game they open. Riftfall and Skybreak share the same local Babylon 8 engine URL.

## Build and verify

In a development environment with the root dependencies already installed:

```sh
npm run build:games
npm run check
npm run test:games
npm test
npm run cloudflare:check
```

`npm ci --ignore-scripts` installs the root lockfile's development dependencies
when needed. No nested package installation, Blender export or paid service is
needed for ordinary builds. The original Random Eras Vite build runs from the
root toolchain; static games copy directly. Browser assets are emitted into
`dist/games/` and are checked into Git so the existing hosting integration and
Node/Docker server can serve them directly.

`manifest.json` lists import/build paths. `runtime-manifest.json` records file sizes
and hashes, including the shared engine. `import-provenance.json` records upstream
commits and excluded hosting identities/history. Original Blender scenes,
project documentation, tests and licence notices stay with their source game.
Git metadata, credentials, runtime user data, separate deployment workflows,
duplicated Boost Circuit history and the old upload ZIP are excluded.

For local development, `npm start` serves every route. The optional authoritative
Node server and Docker deployment serve the same tree behind their existing TLS
configuration; see `docs/dedicated-server.md`. Cloudflare continues to use the
existing Worker and Durable Object identity. No new server process or database
is introduced for each game.

## Gameplay and data

Boost Circuit's physics, room codes and accounts are unchanged. Riftfall and
Skybreak keep their solo bots/building/target modes; Classic is the original solo
arena. Random Eras keeps Frontier, Training and its existing direct WebRTC Arena
friend invites. Its encrypted peer data does not become part of Boost Circuit's
matchmaking service. STUN discovery still helps those peer connections.

Each game has its own settings/progress keys. Riftfall and Skybreak now use
`flyingcars.riftfall.settings.v1` and `flyingcars.skybreak.settings.v1` so they
cannot overwrite each other on one origin. Boost Circuit, Playdock and Random
Eras keep their existing distinct keys. Saves stored on the old Sites domains
remain there: browsers do not let this origin read another site's local storage.
The old hosted copies and source repositories are retained.

The merged copies are served on the existing public game host. The old private
Sites copies retain their access gates. Only client runtime output is published;
server secrets and admin data remain protected. Random Eras' route permits
WebAssembly compilation for its Meshopt model decoder, with JavaScript eval still
blocked. The admin route retains its stricter policy and authentication.

The imported games target desktop keyboard/mouse. Boost Circuit retains its
existing controller/touch support; a responsive hub does not add touch controls
to the other games.

Imported engines, fonts and game artwork retain their original terms, including
Random Eras’ reserved artwork rights. See each game’s bundled notices and
`games/random-eras/LICENSE-ASSETS.md`; consolidation does not relicense them.
