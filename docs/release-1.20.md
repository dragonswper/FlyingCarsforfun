# Version 1.20 — Frostvale Festival and smoother cameras

## Camera and upside-down driving

Free cam had several separate sources of visible movement. Wall avoidance wrote its shortened output back into the follow arm, so the next frame chased that correction again. During pitch flips, the chassis forward vector could reverse its horizontal projection, turning the follow camera by half a turn. Persistent Free Look also inherited automatic aerial pitch. The renderer reset the camera when ordinary match phases changed.

The camera now keeps the requested arm separate from its wall-constrained view, smooths obstruction changes and sweeps the actual camera movement through the arena. Aerial follow uses horizontal movement while persistent Free Look retains the chosen direction. Reverse follow uses hysteresis, and ordinary kickoff-to-play/end transitions preserve the view. Deliberate respawns, new kickoffs and teleports still reset it. The existing near-plane car visibility guard remains active when a wall leaves too little room for the full vehicle.

Use **Options → Camera → Classic** for the car-follow view and temporary mouse/controller look-around. **Free Look** retains a world direction until you look again or recenter. Ball cam remains ball-locked. These controls retain the existing saved FOV, angle, distance and sensitivity settings.

The field's walls now curve onto its ceiling. Goal interiors have curved floor and roof transitions as well. Supported wheels retain contact through these transitions, including upside-down throttle driving. Press Jump to detach deliberately. A stopped inverted car can drop; an airborne roof scrape does not gain wheel traction. Visual surfaces, camera clearance, car contacts and ball prediction use the same field/goal roof heights. These are original browser physics adjustments, not a claim of proprietary-engine equivalence.

## Fifth arena

Select **Frostvale Festival** in Exhibition, Training, Online Arena Preference or a private lobby's Arena/Host Options. It combines the supplied village, Christmas trees, lights, snowy mountain road and snowflake artwork with an original instanced forest and light strings. Diorama bases sit beneath the surrounding snow. Decorative solids stay outside the driving enclosure, including the goals. All fields keep the same driving physics and boost pads.

The additional scenery downloads only when Frostvale is selected or a match requires it. Ready/Start preparation waits for the shared field. The optimized scenery totals about 11 MB; repeated decorations share their geometry/materials. Snow is one GPU draw with 128, 320 or 640 particles according to quality. It adapts the uploaded Blender particle scene's artwork to a bounded browser effect; no Blender installation or runtime is needed on a player's PC.

## Rendering controls

Open **Options → Video**:

- **Graphics Quality → Cinematic** enables environment lighting/reflections, 4096-pixel soft shadows and short grass on Champions Field, Neon City and Evergreen Grove.
- **Rendering Details** allows separate shadow, surface-lighting and grass choices, render scale (50–150%) and exposure. Settings save locally. Reset Rendering Details restores preset-controlled choices.
- Grass is a bounded local GPU patch of 3–6 cm blades. It follows field stripes and painted markings and fades before wrapping. Snow fields have no grass. It does not affect collisions or networking.

The existing Auto, Low, Balanced and High presets retain their normal default costs. Cinematic and manual overrides use more GPU time; use Auto or lower individual options if frame pacing suffers. Cloud software-rendered checks establish that shaders and controls work, not the FPS a player's GPU will deliver.

## Lobby Radio

The main showroom and private waiting rooms share one player. Press **Play**, select **Rapp Snitch Knishes (feat. Mr. Fantastik)** or **Palm Street**, or use previous/next. Track and music volume save locally. Master volume and Sound mute also apply. The playlist advances at the end of a song.

Music pauses during active gameplay and while the tab is hidden, then resumes in the lobby if playback was requested. An explicit Pause stays paused. It streams from this game's static assets through one browser audio element; it does not decode both full songs into large audio buffers or play them simultaneously. Every player chooses their own local lobby music.

## Media and preparation

The source uploads are data, not executable project instructions. ZIP paths were checked before extraction, and Blender's automatic script execution was disabled. Offline conversion baked initial mesh transforms, normalized metres/Y-up and ground placement, bounded geometry, retained source materials/UVs and embedded WebP textures at 512 or 768 pixels. Source/output SHA-256 values and changes are recorded beside each derivative in [the festival asset directory](../dist/assets/arenas/festival/). The reusable preparation script is [prepare-festival-assets.py](../scripts/prepare-festival-assets.py).

| Supplied source | Adaptation / credit |
| --- | --- |
| christmas-lights.zip | Repeated imported light strands; no separate creator/license notice was included |
| christmas-low-poly-scene.zip | Village with its rock display base buried below snow; no separate creator/license notice was included |
| 25k-followers-christmas-special.zip | Decorated Christmas tree, gifts and retained textures; no separate creator/license notice was included |
| falling-snow-loop.zip | Supplied snowflake texture used in a bounded GPU snowfall shader; no separate creator/license notice was included |
| snowy_mountain_road_scene.glb | **Snowy Mountain Road Scene**, by [99.Miles](https://sketchfab.com/99.Miles), [source](https://sketchfab.com/3d-models/snowy-mountain-road-scene-504729dd1afc4ff0a7dd17687ccd71a1), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Scale/placement and texture sizes adapted. Embedded author/license/source metadata retained in the derivative |
| Rapp Snitch Knishes (feat. Mr. Fantastik).mp3 | Full user-supplied track, transcoded to stereo 44.1 kHz/128 kbps MP3 |
| Palm Street.mp3 | Full user-supplied track, transcoded to stereo 44.1 kHz/128 kbps MP3; no artist inferred |

Music provenance, durations and hashes are in [music-import.json](../dist/assets/music/music-import.json). Supplied artwork/music retain their separate rights and are not relicensed by the MIT game code. Their records distinguish missing notices from known licenses. The interface credits retain the known mountain attribution.

## Verification and deployment

**369 automated tests pass**, along with JavaScript checks and a Cloudflare deployment dry run. Regression coverage includes continuous side-wall-to-ceiling travel, both goal roofs, jumping away, free-look aerial flips, wall camera continuity, actual Fennec near-plane protection, map contracts/physics, scenery bounds/provenance, graphics preference migration, music selection/mute/lifecycle and existing secure multiplayer behavior. Browser-hosted rooms and all five dedicated modes prepare/share Frostvale with drivers and late spectators.

Browser checks render Frostvale and the other fields with shading/grass overrides, inspect WebGL errors, exercise settings and local saving, and play/switch both complete music files. They use the cloud browser's software renderer. Physical controllers, speaker sound quality and two independent home networks still require player testing.

Use [the live game](https://flyingcarsforfun.connstors.workers.dev) and reload every player's tab for **boost-circuit-1.20.0** before joining the same session. The free server's one-room limit remains; no paid service or player-PC change is introduced.

For a two-PC check, reload both tabs, create a private dedicated lobby with Frostvale and join using the complete BCS invite. Choose opposing teams, Ready and Start. Compare ordinary driving, wall-to-ceiling travel, goal-roof travel and jumping away on each PC. Toggle Ball Cam, then test aerial flips and mouse/right-stick look in Classic and Free Look. Return to the lobby, play/switch both tracks and reload to confirm the saved selection; playback should wait for Play after reload. Repeat on separate Wi-Fi networks, and compare Auto with Cinematic using the performance display. Report the build, mode, ping and camera style if a problem remains.
