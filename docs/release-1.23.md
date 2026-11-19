# 1.23 — Harbourworks, custom HUD and mobile polish

Play at https://flyingcarsforfun.connstors.workers.dev. Reload all players for **boost-circuit-1.23.0**. The existing free, public service and one-room limit remain in use. No player-side installation is needed.

## Original Blender stadium

Choose **Harbourworks** in the field selectors, or **Explore → Harbourworks** in the main menu. It is available in solo exhibition/practice, room-code games, custom/dedicated matches and online match arena preferences. The server chooses one field for all drivers and spectators; preferences do not split the matchmaking queue.

This original stadium has terraced blue/orange seating, standing-seam steel canopies, braced columns, floodlights, brick warehouses, dock cranes, shipping containers, a harbour basin and venue signage. It was modeled in Blender with mesh geometry and materials, without downloaded textures or generated image scenery. All decorative architecture stays outside the playable volume. The existing regulation field, ramps, goal interiors, ceiling transitions, boost pads and shared physics are preserved.

The scene has **68,780 triangles**, **13 material batches**, no external textures and a **3.76 MB** GLB. The rendered field preview is a **76 KB WebP**. The map loads only when selected or required by a match and is reused when revisiting. This shares the existing mobile graphics budgets; it is not a promise of a particular physical phone FPS.

- Editable source: [art/harbourworks.blend](../art/harbourworks.blend), including the modeled scene, preview pitch, camera and lights.
- Generator: [scripts/create-harbourworks.py](../scripts/create-harbourworks.py). Run `blender -b -t 2 --factory-startup --disable-autoexec -P scripts/create-harbourworks.py` in a development workspace with Blender 4+ and FFmpeg. No tools are required on players' computers.
- Export and provenance: [dist/assets/maps/harbourworks.json](../dist/assets/maps/harbourworks.json). The original map, generator, preview and source are covered by the repository's MIT license. Existing supplied vehicles/stadium artwork keep their separate credit records.

## HUD layout studio

Open **Options → Interface → Edit HUD Layout**. Move the score/clock, boost meter, connection label, Chat and Pause. On touch devices, also move the joystick, action-button group, air-roll group and camera/reset group.

Drag the preview widgets or use arrow keys. Select a widget to adjust horizontal/vertical position, size (60–140%) and opacity (35–100%). Information widgets can be hidden; Pause, Chat, score and driving groups stay available. **Mirror Touch** swaps the sides of the touch groups. **Reset** restores the current profile's defaults. **Save Layout** stores it locally; Cancel/Escape discards the draft. Blocked local storage is reported as session-only application.

Desktop, phone landscape and phone portrait are separate profiles. Rotating a phone selects its matching profile without overwriting the other one. Saved centers are constrained to keep controls on screen when resized. Defaults stay in effect until an override is saved. Adjusting layouts does not change physics, mouse bindings or controller bindings. Custom buttons still accept independent fingers and release when paused, hidden or cancelled.

## Mobile display and menu improvements

The menus use larger touch targets, clearer focus states, constrained/scrolling radio and settings panels, a field preview, a direct garage close button and a rearranged portrait HUD to separate score, connection text and the gameplay toolbar. The new interface artwork uses CSS, SVG and the Blender render; existing supplied vehicle art remains credited separately.

Fullscreen is now available from the gameplay toolbar and **Options → Video**. **Fullscreen on Play** is optional and off by default. Requests occur on a real tap; supported browsers may also allow landscape lock. Unsupported/denied requests show instructions and do not interrupt automatic match startup or repeatedly retry.

iPhone Safari can restrict fullscreen. Use **Share → Add to Home Screen**, launch the icon and turn the phone sideways. Android browsers can use the Fullscreen button or their home-screen option where available. The manifest includes PNG home-screen icons and an Apple touch icon. This remains an online browser game; it does not install native game code or provide offline multiplayer.

## Verification

**397 automated tests pass**, with JavaScript syntax and Cloudflare deployment build checks. New tests cover actual GLB calibration/clearance/normals/material and size budgets, retained editable Blender source, valid arena contracts, late spectator/rematch map propagation, HUD storage isolation/clamping/containment and safe essential controls, fullscreen success/exit/denial/unsupported/standalone behavior. Existing driving, contact prediction, networking, reconnect, chat, friends, camera and touch tests remain green.

Browser checks cover desktop keyboard driving and field selection, a non-overlapping toolbar, desktop HUD save/reset, phone multi-touch driving after moving/resizing the joystick, fullscreen enter/exit, drag/cancel, independent portrait/landscape profiles, reload persistence and browser-help fallback. These run in Chromium with software rendering and touch emulation. Physical Android/iPhone/Safari, hardware controllers and cross-house Australian networking still need player evaluation.

To test with friends, reload both clients, create/join a dedicated private lobby, choose Harbourworks, opposing teams and Ready/Start. Check that a late spectator sees the same field and that a rematch can select another arena. On a phone, set separate portrait/landscape joystick positions, rotate, hold joystick + Boost + Jump, release each finger separately, then pause and resume. Reload to verify your layout stays saved. Try fullscreen from an ordinary tap and its home-screen instructions on Safari.
