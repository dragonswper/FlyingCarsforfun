# Blender assets

The editable originals live in [blender/src](blender/src). The scene groups cover the knight, weapons, terrain kit, era props and interface art. Retired Kenney and gimora assets are still attributed in the historical commits that shipped them.

The knight uses procedural arm IK. Keeping the shoulder, elbow, wrist and grip nodes in the model lets the game solve the same reach for the player, the trail and the other fighter. The project has no Blender action clips. Weapons keep a grip origin and named tip, and the export carries the authored collider dimensions for era dressing.

The kit uses faceted meshes, bevels, material colors and per-face painted values. UI backgrounds, portrait, parchment and the wax-seal marks are Blender renders. The image pack uses WebP. The export uses gltfpack as a build-only dependency for Meshopt compression. It keeps the named pivots and preserves floating-point positions so the map geometry keeps its fitted bounds. Three.js supplies the browser decoder. Triangle and file budgets are enforced in the test suite.
