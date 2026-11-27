> Historical document supplied in Riftfall-Web-Prototype.zip. Its browser-test claims were not independently rerun in this environment and do not verify v0.2.0.

# Verification

Verified on Windows in headless Microsoft Edge with software WebGL rendering. These checks establish the prototype behaviors listed below; they do not establish performance on every GPU or compatibility with the user’s unsupplied launcher.

The Node HTTP-server test also passed: static game assets, HEAD responses, invalid URLs, traversal attempts and non-read methods.

## Browser gameplay

- 3D lobby initializes with local engine and no runtime errors
- Outfit and settings survive a reload
- Practice starts with seven targets; WASD changes the player position
- Firing consumes ammo and reload transfers reserve rounds
- Building places cover, costs wood, and switches to ramps
- Escape pauses simulation; resume and return to lobby work
- Skirmish bots inflict damage
- Narrow lobby remains usable without horizontal overflow

## Launcher frame and origins

- Launcher example receives the real iframe ready event
- Practice starts from the embedded game UI
- Launcher Pause freezes the local simulation
- Launcher Resume advances the local simulation
- Launcher Return to lobby stops the embedded match
- A different configured parent origin receives ready
- Cross-origin parent can pause with its exact configured origin
- Cross-origin parent can resume and stop with its exact configured origin
- A parent whose origin differs from parentOrigin cannot pause the game
- A parent whose origin differs from parentOrigin cannot stop the game
- Integration sessions report no uncaught browser errors

## Controlled world simulation

- Controlled simulation: player walks up a placed ramp, jumps and lands on its surface
- Real Babylon ray picking: an unobstructed rifle shot damages a target
- Controlled eliminations trigger victory and clean replay state

Scope: Real browser with controlled simulation steps; not a full human-played match.

The browser gameplay session reported no uncaught JavaScript errors and no external asset requests. Outfits, sensitivity, quality, sound preference and personal best use optional local browser storage. Keyboard and mouse gameplay is implemented; mobile touch controls and online multiplayer are not.

The standalone assets are in `dist/`. The launcher demonstration is `dist/launcher-example.html`. The actual launcher source was not supplied; its direct integration remains unverified.

REA help and Magnesium static archive inspection exited successfully; see `archive-assessment.md`, `rea-help.txt` and `rea-magnesium.json`. No Fortnite executable or Magnesium DLL was run.
