# Random Eras

A first-person browser melee game with seeded terrain, a playable armored knight, and three modes.

- **Frontier** puts four strongholds in one landscape. Explore, collect era weapons, defend your core and destroy the rival cores. Use a daily seed or choose a starting era, size and seed.
- **The Pit** is an enclosed melee duel against a bot or a friend. Both fighters ready up before an online duel.
- **Training** has stationary and strafing targets that reset after being defeated. Practice movement, flicks, switching targets and chaining attacks without incoming damage.

## Run locally

Use Node.js 22.12 or later and a desktop browser with WebGL 2.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite prints the local URL. The production build is in `dist/`.

## Default controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse movement | Look and position your weapon |
| Long, quick mouse swipe or left click | Swing with the attack input selected in Settings |
| Attack when the reticle shows an extra ring | Queue a follow-up during the end of the active swing |
| Hold right click | Guard with the shield |
| Shift | Sprint |
| E | Pick up nearby gear |
| 1–9 | Equip a carried weapon |
| V | Switch between first and third person in Frontier or Training |
| Tab | Match status |
| M | Frontier field map |
| Escape | Game menu |

Click the game if it needs to capture the mouse. The cursor is hidden while captured, with unadjusted relative movement when supported. Choose **Mouse swipe** or **Left click** under **Settings → Controls → Attack input**. **Settings → Gameplay** exposes swipe thresholds and the solo combo window. Hold the shield just before impact to parry. `CombatTuning` in `src/combat.js` defines the minimum swipe speed and distance, the swipe window, and combo timing. Per-weapon timing lives in `src/simulation.js`.

Career records sessions, hits, knockdowns and longest chains in this browser. The optional Yard guide is under Gameplay Settings.

## Play with a friend

1. Open **Arena**. The host picks an age and weapon and selects **Invite a friend**.
2. The guest opens **Join a friend**, pastes the invite, and sends back the generated response.
3. The host pastes the response. Both players select **Ready**.

Both players should load the current build. The connection uses direct WebRTC with compressed invite codes. **Play across two tabs** uses the same code exchange for side-by-side windows in one browser profile. The Frontier camp is a local lobby preview with bot rivals. [How Arena connections work](NETWORK.md)

## Porting and credits

The knight, weapons, props and interface art are original Blender assets. The editable scenes and export command are documented in [BLENDER.md](BLENDER.md). [Asset rights](LICENSE-ASSETS.md)

Cinzel, Caveat and DM Sans ship under the SIL Open Font License. [Font notices](public/fonts)

Terrain generation and combat timing run independently of the browser renderer. Terrain exports and the engine mapping are documented in [PORTING.md](PORTING.md). The menu flow and design tokens are documented in [UI_PORTING.md](UI_PORTING.md).


Frontier uses outlet-first drainage for erosion and graded roads to join fort gates at a dry river crossing. The approaches came from reading two open-source terrain generators. [Red Blob Games’ Mapgen4](https://github.com/redblobgames/mapgen4) · [Heightmap Level Generator](https://github.com/m-w-marker/heightmap-level-generator)


The training drills draw on the glossary’s distinctions between flicking, microcorrection, target switching and smooth tracking. The reference review covered the Markdown and configuration at commit `4bc23a8`; no repository code or dependencies are used. [Aiming Taxonomy](https://github.com/aiming-taxonomy/glossary/tree/4bc23a80e80563b7e027f7aaeda12385da0d114a)
