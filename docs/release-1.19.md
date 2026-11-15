# Version 1.19 — new fields and engine audio

The game now has four selectable arenas. Champions Field remains available alongside three original outdoor environments:

| Field | Environment |
| --- | --- |
| Winterlight Park | A snow-covered field, mountain village, frosted pines, Christmas trees, presents, festive lights and light snowfall |
| Neon City | A night-time city skyline, lit windows, neon roof trim and surrounding avenues |
| Evergreen Grove | A forest clearing with pines, broadleaf trees, rocks, wooded hills and timber fencing |

Each field uses the same regulation pitch dimensions, rounded collision ramps, goals, ceiling, ball behavior and 34 boost pads. Snow changes the surface appearance; handling remains consistent across fields. Decorative solids sit outside the playing enclosure. The 1.18.1 camera clearance and local-car visibility fixes remain active on every field.

## Choose a field

- **Exhibition / Training → Arena:** preview a field, then start the match or practice session. The selection saves locally. The Start button waits for the new field's shaders to finish preparing.
- **Private Match:** select the field before hosting an eight-character-code room, or use **Custom Lobby → Arena** for browser-hosted and dedicated-server lobbies.
- **Custom Lobby → Host Options → Arena:** select the next field after a match. Changing only the field or match length preserves teams. Updated host settings clear old rematch votes; players consent to the new match settings again. Changing the server mode still returns players to role selection.
- **Online Match → Arena Preference:** choose a preferred field. Arena preferences share the existing matchmaking pool, so a different preference does not prevent two players from meeting. The first queued player's valid preference becomes the session field; everyone loads the authoritative selection. Bot fallback uses the same selection. Both players still need compatible mode, difficulty and region settings.

The field travels in the validated room/match options. Players, late spectators, rematches and reconnects receive that selection rather than using an unrelated local preference. Unknown IDs safely select Champions Field.

The existing free hosting limit of one simultaneous room remains. This update adds no paid service, account requirement or PC installation.

## Engine audio

**Options → Audio** now includes:

- **Sport — Recorded:** a real recorded engine loop with load-dependent filtering and rev changes.
- **Muscle — Deep Exhaust:** a lower-pitched variation with stronger bass.
- **Electric — Turbine:** an original synthetic motor profile.
- Independent **Engine + Boost Volume**, **Match Effects Volume** and the existing Master Volume.
- **Preview Engine**, which plays a short rev preview so profiles can be compared without starting a match.

The local engine responds to throttle, driving speed, airborne revving and boost. An audio-only transmission adds shifts with hysteresis, avoiding repeated gear changes around a speed boundary. It does not alter acceleration or game physics. Boost has a filtered rush, with subtle tyre noise during grounded powerslides. Existing ball/contact and match-feedback effects remain. Sound and volume changes ease their gains, pause/spectator/menu states silence driving sounds, and hiding the tab silences the output. Browsers still require a user interaction before starting audio.

The recorded sample is **“racing car engine sound loops,” by domasx2**, published under **CC0 1.0** on [OpenGameArt](https://opengameart.org/content/racing-car-engine-sound-loops). The author's page identifies its public-domain recording source. The bundled mono WAV is about 74 KB; processing removes DC offset, crossfades the loop seam and normalizes the peak. Source URLs, license and original/processed SHA-256 values are in [engine-credit.json](../dist/assets/audio/engine-credit.json). Engine layering and the three map environments are original game code/artwork.

If the sample cannot download or decode, the game keeps working with a quieter synthetic fallback. No remote audio stream is required during play.

## Performance and verification

Scenery uses deterministic GPU instancing with fewer than 20 decorative mesh batches per new environment. Geometry and field textures are cached for the four fixed IDs. Snow uses one GPU particle draw; Low uses 96 flakes, Balanced 224 and High 384. In the development render fixture, all three new fields used fewer draw calls than Champions Field. This is a rendering comparison, not a measurement of player FPS.

**344 automated tests pass.** New coverage includes map validation/migration, identical physics across fields, decorative geometry staying out of play, bounded scenery, shared matchmaking despite different field preferences, the recorded WAV and its loop seam, audio transmission behavior, server propagation to players/spectators, next-field rematches and retaining the field after reconnecting. Existing physics, prediction, camera, controller, social and secure multiplayer regressions remain.

Rendered browser checks drive on all four fields, decode the recorded loop and measure its output with an analyser, exercise all three previews, mute the engine independently, preserve camera settings, save/reload audio preferences and select online/private fields. These checks use a software-rendered cloud browser; physical controllers, speakers and a player's GPU FPS need local evaluation. A browser analyser confirms output, not subjective sound quality.

Use [the live game](https://flyingcarsforfun.connstors.workers.dev) and reload every player's tab for **boost-circuit-1.19.0** before starting a new session.
