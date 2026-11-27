# Merge notes — v0.2.0

## Inputs

- Riftfall-Web-Prototype.zip: Babylon.js game loop, third-person actors, island, seven bot opponents, storm, supplies, basic walls/ramps, lobby, outfits, settings and iframe bridge.
- Skybreak v1: eight-target arena concept, original target placement/gameplay direction, visual palette and prominent training flow. Original source is preserved under reference/skybreak-v1/; its Three.js runtime is not loaded alongside Babylon in the new game.
- Magnesium C++ and Carbon/Neonite archives from earlier discussion: architectural references only. Native DLLs, executables and the backend auto-updater are not included or executed. Their full game client, accounts and networking cannot be made browser-native by concatenating files.

## Implementation

One engine and one lobby now serve all three modes. The new Skybreak mode translates the earlier target mechanics into Babylon scene geometry, shares weapon/build controls with Riftfall, and has an actual three-minute completion/failure condition and speed bonus.

Added: two weapon magazines, a harvesting tool, floors, elevation-aware connected building, oriented thin-wall collision, red/blue build validity previews, camera obstruction, muzzle occlusion, six glTF scenery assets, a mode deck, paused map, compass, reactive quickbar, local career records and XP, and self-hosted typography/artwork.

Corrected: practice respawns no longer accumulate disabled actors indefinitely; pickups while the pickaxe is equipped credit rifle reserves; repeated builds do not consume resources; old builds are capped; imported historical browser-test claims are labelled accordingly.

Existing Sites identity and owner-private audience are retained. The source is saved to the user-selected GitHub repository. GitHub Pages publication is optional and manually triggered, keeping it distinct from the private Sites deployment.
