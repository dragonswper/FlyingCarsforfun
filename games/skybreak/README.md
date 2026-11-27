# Riftfall — Skybreak Island

A browser-native 3D build-and-battle game combining the uploaded **Riftfall Web Prototype** with the earlier **Skybreak arena**. Players render the game on their own computer/GPU. No Windows game installation, account, native launcher, server DLL, or cloud GPU is required.

**Play:** https://skybreak-build-arena.bobistheman2049.chatgpt.site (owner-private Sites deployment)

**Source:** https://github.com/dragonswper/fortnite_broswer

## The playable release: v0.2.0

- **Solo skirmish:** face seven local bot opponents, collect supplies, use cover, survive the shrinking storm and win the island.
- **Free practice:** respawning opponents, no incoming fire or storm, building practice, and a Finish Practice button.
- **Skybreak run:** hit eight fixed bullseyes in three minutes. A faster clear earns a larger score bonus.
- Rifle and shotgun with independent ammo/reloads, aiming, and a pickaxe that harvests nearby trees.
- Wood walls, climbable ramps, floors, build previews, rotation and elevated connected building. Builds cost 20 wood; the oldest build is removed after 70 structures to limit memory use.
- Third-person movement, jumping, sprinting, camera obstruction checks and shot occlusion.
- Minimap, compass, paused full map, reactive quickbar, shield/health, supplies, results and clean replay.
- Three original outfit palettes, sensitivity/graphics/audio settings, optional FPS display, local XP, challenges and recent-match history.
- Six bundled Kenney CC0 models: pine, oak, rock, grass, logs and clouds. Assets have procedural fallbacks.
- Original lobby illustrations, bundled typography, responsive lobby and keyboard-friendly dialogs.

Desktop keyboard/mouse and WebGL are required for gameplay. The responsive lobby does not include touch gameplay controls. There is no online multiplayer, Epic account support, Fortnite map/skins, or Carbon/Magnesium runtime integration. This is an independent playable browser game, not the Fortnite Windows client ported to WebAssembly.

## Controls

| Input | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Space / Shift | Jump / sprint |
| Left / right mouse | Fire, harvest or place build / aim |
| 1 / 2 / 3 | Rifle / shotgun / pickaxe |
| Q | Toggle building |
| E / F | Cycle wall, ramp, floor / rotate |
| 4 / 5 / 6 | Select wall / ramp / floor |
| R | Reload current weapon |
| M / Escape | Paused island map / pause |

Click the island to capture the mouse. Escape releases it. If capture is unavailable, click and drag to look. Settings and career records are stored only in this browser; private-mode storage may be unavailable. No shell, filesystem, executable-launch or installation capability is used by the game.

## Run from source (optional)

The published game needs no installation. For development, with Node.js 22+ already installed:

```sh
node scripts/serve.mjs
# Open http://127.0.0.1:4173
```

`dist/` is complete and has no CDN or external font dependency. Do not open `index.html` using a file:// URL. Any static HTTP/HTTPS host works. The included server binds to 127.0.0.1 and only serves dist/. It does not modify system settings or install anything.

```sh
npm run check
npm test
```

These commands need no package installation: the tests use Node built-ins and the bundled Babylon engine. Optional development dependencies are pinned in package-lock.json. Use `npm ci --ignore-scripts` only if you choose to refresh vendored dependencies or run the retained Playwright suites. Do not run `npm run vendor` unless those development dependencies are present.

## Hosting on GitHub Pages

The source repository is a backup and development home; uploading it does not itself activate GitHub Pages. To host it there, set Pages to **GitHub Actions** in repository settings and run the **Publish GitHub Pages** workflow. It publishes only dist/. It is a separate public website and is not enabled automatically by this release. The **Verify game** workflow runs syntax, asset and simulation checks on pushes and pull requests.

## Verification and limits

See [verification](docs/verification.md), [design research and asset provenance](docs/design-research.md) and [merge notes](docs/merge-notes.md).

The automated release checks exercise the real Babylon NullEngine, scene geometry, glTF loader and ray picking. They are not a substitute for interactive browser/GPU playtesting. The managed workspace did not expose the required browser-control tool, so visual layout, pointer lock, WebGL rendering, audio and hardware performance remain unverified in a real browser for this release. Older uploaded browser-test results are marked historical.

## Launcher integration

The uploaded origin-checked iframe bridge is retained. See [launcher integration](docs/launcher-integration.md) and dist/launcher-example.html. Native executables and Windows DLLs cannot be started through this bridge.

## Credits

- Riftfall browser baseline: user-supplied Riftfall-Web-Prototype.zip.
- Skybreak browser arena: earlier prototype in this project; preserved under reference/skybreak-v1/.
- Babylon.js and its glTF loader, v8.0.0: Apache License 2.0, bundled license/notice in dist/vendor/.
- Kenney 3D models: CC0 1.0; hashes, original source pages and download commits in dist/assets/models/manifest.json.
- Barlow Condensed font by Jeremy Tribby: SIL Open Font License, bundled in dist/assets/fonts/OFL.txt.
- Lobby illustrations and game characters: original procedural artwork. Fortnite reference images were researched, not included in the distribution.

Higgsfield artwork was requested, but the connected account rejected both submissions with “Requires basic plan or higher.” No images were generated and no paid alternative or subscription change was made. The shipped lobby uses original SVG/PNG artwork instead.
