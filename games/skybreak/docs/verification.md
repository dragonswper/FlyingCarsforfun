# Verification — v0.2.0

Verified in the isolated Linux cloud workspace on 11 November 2026. No software was installed and no settings were changed on the user's PC.

## Passed release checks

`npm run check`: all three authored runtime JavaScript files pass Node's parser.

`npm test`: **13 passing tests**, using only the shipped engine/loader and Node built-ins:

1. Static HTTP assets/HEAD requests work; invalid URLs, traversal and write methods are rejected.
2. Three gameplay modes initialize distinctly, practice does not inflict damage, and Skybreak expires at three minutes.
3. Movement is normalized; island bounds, jump/landing and pause/resume state hold.
4. Rifle/shotgun ammo remains independent; reload transfers reserve rounds; tree harvesting grants wood.
5. Builds cost wood, duplicates do not; real ramps and elevated floors support movement/landing.
6. Thin-wall collision respects orientation, actor footprint and elevation.
7. Actual Babylon ray picking hits a target and cover stops shots.
8. Eight actual target hits finish Skybreak; replay resets targets, ammo, builds and held input.
9. Shield damage, storm damage and skirmish victory behave differently and correctly.
10. Repeated practice respawns replace old actors without unbounded bot accumulation.
11. All six GLBs have matching manifest hashes, CC0 provenance and no external model/texture dependencies.
12. Babylon's real glTF loader imports all six GLBs; asset placement scales/positions them correctly and removes fallback meshes.
13. DOM IDs are unique, UI element references and linked assets resolve, and runtime scripts/fonts/styles are local.

Babylon NullEngine provides real scene graphs, geometry, loading and ray intersection math without rendering WebGL pixels. These tests do not establish visual appearance or frame rate.

## Browser verification still required

The attached managed environment is running and reports remote_desktop enabled with state unknown. The required `cua_repl.js` browser-control tool and `open_in_codex` handoff tool were not exposed to this turn. In accordance with the Sites managed-preview workflow, no alternative browser controller or preview server was installed or substituted.

Environment ID: `ccarenv_b64_Y2NhcmVudl84NmY1OTI5ZWEyZjg4MTkxYmM5M2JmYTlhMWZjNDNmNQ`.

Consequently, interactive pointer lock, mouse/keyboard event behavior, fullscreen, WebGL rendering, CSS at real viewport sizes, audio output, iframe integration and GPU performance remain unverified for v0.2.0. The retained Playwright suites can be run in a browser-equipped development environment; they were supplied with the older prototype and were not rerun here. Their historical result document is under imported/ and is not evidence for this release.

## External service results

- Higgsfield: two requested images rejected before generation (“Requires basic plan or higher”); no completed jobs or generated images.
- GitHub: user-selected repository dragonswper/fortnite_broswer, initially empty. Source publication is verified separately by comparing the remote main commit with local HEAD.
- Sites: existing identity and owner-private audience retained. Deployment status and URL are taken from the publishing service; that establishes publication, not browser playtesting.
