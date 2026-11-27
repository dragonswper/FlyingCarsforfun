# Random Eras

A first-person browser melee game with seeded terrain, a playable armored knight, and three modes.

- **Frontier** puts four strongholds in one landscape. Explore, collect era weapons, defend your core and destroy the rival cores. Use a daily seed or choose a starting era, size and seed.
- **The Pit** is an enclosed melee duel against a bot or a friend. Both fighters ready up before an online duel.
- **Training** has stationary and strafing targets that reset after being defeated. Practice movement, flicks, switching targets and chaining attacks without incoming damage.

## Run locally

Use Node.js 22.12 or later and a current browser with WebGL 2.

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
| F / tap Focus bar | Activate a fully charged Focus |
| 1–9 | Equip a carried weapon |
| V | Switch between first and third person in Frontier or Training |
| Tab | Match status |
| M | Frontier field map |
| Escape | Game menu |

Click the game if it needs to capture the mouse. The cursor is hidden while captured, with unadjusted relative movement when supported. Choose **Mouse swipe** or **Left click** under **Settings → Controls → Attack input**. **Settings → Gameplay** exposes swipe thresholds and the solo combo window. Hold the shield just before impact to parry. `CombatTuning` in `src/combat.js` defines the minimum swipe speed and distance, the swipe window, and combo timing. Per-weapon timing lives in `src/simulation.js`.

Career records sessions, hits, knockdowns and longest chains in this browser. The optional Yard guide is under Gameplay Settings.

On touch devices, use the left joystick to move (push fully to sprint), drag the
field to look, tap Attack, or hold Guard. Pick up, Weapon and View buttons sit
beside the combat controls. Opening the menu, changing orientation or cancelling
a touch clears held controls. Touch devices start at low quality, 75% resolution
and 30 FPS unless saved settings override those defaults.

Build 0.4.0 adds an independent loading/reload screen so a failed entry download
does not leave a dead menu. A failed renderer download offers Reload too. When
browser storage is blocked, matches and career recaps still work for the visit.
If mouse capture is unavailable, hold and drag the field to look.

## Hit combos and Focus

Land clean hits within three seconds of one another to grow the hit-combo
counter. A missed or blocked swing, taking damage, dying or letting the
window expire breaks the streak; its best value remains in the match and local
career. Buffered follow-up swings still use the reticle's existing combo window.

Each clean swing earns 20% Focus, once per swing even if it hits several enemies.
At 100%, press **F** (rebindable in Settings) or tap the **Focus** bar. For four
seconds, opponents move, react and swing at 35% speed while you remain responsive.
Scenery and impact particles slow as well. Charge is spent on activation and hits
cannot refill it while active. Dying clears charge. Simultaneous opposing Focus
activations counter each other's slowdown.

The same simulation owns both players' timers and charge in online Arena. Both
players must reload this build and create fresh RE4 invites; RE3 invites are
rejected rather than combining incompatible combat rules.

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
