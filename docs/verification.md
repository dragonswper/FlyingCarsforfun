# Verification

The release was developed and tested in an isolated Linux cloud workspace. No applications were installed or settings changed on the user's computer.

## Automated checks

**24 automated tests pass.**

`npm run check` parses the four authored runtime modules. `npm test` exercises the original simulation, Three.js scene geometry, input handlers, asset references and static HTTP server without installing packages.

Coverage includes arena/pad dimensions, acceleration/reverse/braking, speed caps, fuel consumption, variable-height jumping, double jump/dodge, aerial pitch, floor/wall/corner/ceiling bounces, real oriented car-ball contact, boost refill/recharge, full-ball goal crossing, wide/high misses, kickoff clock, zero-time live ball, overtime/results, training progression, bounded replays, finite long-running bot matches, wall driving, demolition/respawn, own-goal routing regression, practice reset restrictions, both vehicle geometries, original ball/stadium geometry, local asset resolution, keyboard/mouse clearing and standard gamepad button mappings.

Three.js math/geometry can run without a GPU; these tests do not render WebGL pixels. The input test uses synthetic events and a simulated standard gamepad, not a physical controller.

## Browser test limit

The Sites managed-preview skill requires the supplied `cua_repl.js` browser tool. It was not present in the available tools, and `open_in_codex` was also unavailable. In accordance with that workflow, no alternative browser controller was installed or substituted and no preview server was started. The game remains unverified for interactive browser play, actual GPU performance, CSS layouts, fullscreen, audio output and real controllers.

The managed environment reports a running runtime with remote_desktop enabled but state unknown. Environment: `ccarenv_b64_Y2NhcmVudl84NmY1OTI5ZWEyZjg4MTkxYmM5M2JmYTlhMWZjNDNmNQ`.

## Publishing

A successful Sites deployment verifies that the exact committed source/build was published at the reported URL; it does not verify gameplay. GitHub source is saved under games/boost-circuit in the existing user-selected repository, preserving the Riftfall project.
