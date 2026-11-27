# Design research and asset provenance

Research performed 11 November 2026. Reference images are not distributed with the game.

## Fortnite references

1. [Epic: HUD Controller devices](https://dev.epicgames.com/documentation/en-us/fortnite/using-hud-controller-devices-in-fortnite-creative): identified the health/shield, minimap, storm timer, elimination count, reticle, equipped-item info, quickbar and building-resource information that makes the game readable during action.
2. [Epic: Fortnite OG is back](https://www.fortnite.com/news/fortnite-og-is-back-and-here-to-stay): studied the official OG imagery and the described traversal/building/loot loop. The image reviewed uses chunky evergreen silhouettes, saturated foliage, warm light, blue atmospheric distance and strongly separated character silhouettes.
3. [Epic: advanced storm controller](https://dev.epicgames.com/documentation/fortnite/using-advanced-storm-controller-devices-in-fortnite-creative?lang=en-US): a reference for shrinking safe-zone gameplay, not copied implementation.

Application: a clear third-person silhouette, uncluttered reticle, compact top-right minimap, bottom-left vitals, bottom-right equipment/build quickbar, and contextual resource/timer feedback. The lobby uses bold condensed type, a prominent selected character, a bright primary play action and clearly labelled mode cards. A cobalt/mint/lime palette and original island illustrations establish an independent identity.

This is stylistic research, not a 1:1 recreation or an assertion of equivalence to Fortnite's art, animation, physics or networking. Exact Fortnite logos, characters, extracted UI artwork and game files are not shipped.

## Models actually included and used

Kenney identifies the [Nature Kit](https://kenney.nl/assets/nature-kit) as CC0 1.0. The direct ZIP download was unavailable from this workspace. Five individual GLBs were downloaded from the [Tiny Game Engine mirror](https://github.com/Hidencod/tge-assets) at commit `3ddcc695adbba9fb918cf31b7c139b3f95b76910`:

- tree-pinetalla-detailed.glb → pine trees
- tree-oak.glb → oak trees
- rock-largea.glb → rocks
- grass-large.glb → foliage
- log-stack.glb → log props

A cloud model comes directly from [Kenney's official platformer starter](https://github.com/KenneyNL/Starter-Kit-3D-Platformer), commit `3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0`. Its README explicitly identifies its 3D models as CC0. The cloud's external palette texture was replaced with a flat white material to keep the model self-contained. Geometry is unchanged.

Exact download URLs and SHA-256 hashes are recorded in [the model manifest](../dist/assets/models/manifest.json). The full CC0 text is bundled. All six models were imported with Babylon's actual glTF loader in the release checks. Each is normalized to the intended world height; repeated scenery uses instancing. Procedural scenery remains a fallback if optional art cannot load.

## Other presentation assets

- Original authored `island-art.svg`, `practice-art.svg`, `challenge-art.svg` and `island-cover.svg` in dist/assets/. The PNG cover is rendered from the SVG.
- Barlow Condensed 800, obtained through Google Fonts, with its official OFL text from the google/fonts repository. Font is served locally.
- Higgsfield GPT Image 2.6 was queried and two original landscape requests submitted. Both were rejected before generation because the account requires a Basic plan or higher. There are no generated jobs or Higgsfield images in this release. No model-generation or plan-upgrade claim is made.
