# 1.27 — a sky for every arena

Every map now has an original sky dome in place of its flat background colour. The shared dome and eleven sky paintings were created/exported with Blender; the editable source includes all paintings packed into one `.blend` file. Existing field lighting, regulation collisions, camera behavior and network simulation are retained.

| Arena | Sky |
| --- | --- |
| Champions Field | Blue stadium dusk, warm horizon and scattered clouds |
| Winterlight Park | Crisp winter daylight and soft snow clouds |
| Neon City | Indigo city night, stars and a crescent moon |
| Evergreen Grove | Warm woodland afternoon and pale cloud banks |
| Harbourworks | Marine overcast with a warm break near the horizon |
| Frostvale Festival | Starry winter twilight and a green aurora ribbon |
| Yuletide Market | Rose winter dusk, soft clouds and a crescent moon |
| Halloween Hollow | Violet cloud cover, stars and a harvest moon |
| Sunset Coast | Apricot sunset fading into pink clouds and blue overhead |
| Red Rock Canyon | Clear desert daylight and high, thin clouds |
| Orbital Station | Deep-space stars and a faint Milky Way band |

The browser loads the chosen sky with its field and reuses it on later visits. All maps share one 960-triangle Blender mesh and one unlit, textured draw call. The dome follows the camera through aerials and wall/ceiling driving, remains behind field geometry and ignores fog/shadows. Baked cloud/star artwork avoids a live fullscreen noise shader or added weather simulation. The dome plus all eleven WebP textures total approximately 121 KB; the editable Blender source is not downloaded by the game.

Automated checks cover source/export integrity, unique images for every arena, texture dimensions, mesh/UV calibration, lazy shared loading, retries, camera following and disposal. Chromium renders every field and a phone-sized landscape viewport, confirming exactly one additional draw and 960 triangles; switching through all fields downloads one dome and eleven sky images. A two-client HTTPS/WSS check verifies the selected sky during synchronized matches and a rematch. All 469 game tests, the syntax check and Cloudflare dry-run pass before publication; the live build/assets and dedicated multiplayer service are verified afterward.

Select any field in Exhibition, Training or Private Match, or let Online Match choose a random field. Reload the game on both players' devices for **1.27.0**. Mobile uses the same lightweight sky artwork. The sky is decorative; its clouds are static, and no physics, server placement or latency guarantee is added.

Editable source: [art/sky-domes.blend](../art/sky-domes.blend). Generator: [scripts/create-sky-domes.py](../scripts/create-sky-domes.py). [Artwork and rebuild instructions](../art/README.md#original-sky-domes).
