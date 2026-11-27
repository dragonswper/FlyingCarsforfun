# Rebuild changelog

## A. Combat feel

- Cuts now differ in sweep, hit angle, guard cost and stagger.
- Hits pause the simulation briefly and carry a separate sound and particle cue. Guard has a timed parry and an exhaustion break.
- Factions vary their timing, circling and feints. Four era weapons join the roster.
- Gameplay Settings expose swipe thresholds, hand response and the solo combo window.

## B. World and art

- The game now loads the Blender knight, weapons and scenery. Editable scenes and repeatable exports ship with the repo.
- Era landmarks and camps dress the existing terrain. A timber bridge marks a ford, and the world light and haze change over time.
- The map uses a warm ink palette. Large previews label the strongholds, and Frontier names each region on entry.
- Asset tests enforce the triangle, texture and download budgets.

## C. Campaign screens

- Loadout has a rotating weapon, an armor cloth choice and a title.
- Career saves local sessions, hits, knockdowns and longest chains. The match recap shows accuracy, defenses and time.
- Training has a short optional drill guide. Controls includes a live swipe test, and M opens the Frontier field map.
- Music and ambience have their own levels. The menu sound and footsteps are synthesized in the browser.

## D. Arena connections

- Direct invites use gzip when it makes the code shorter. Copy buttons name the code they copy.
- An old invite tells both players to refresh. Connection loss clears stale attack input.
- Guest movement eases on the host and fades when packets stop.
- Transport tests cover malformed messages, large payloads and invite round trips.

## E. Reliability

- Meshopt compression reduces the download size and keeps the Blender pivots intact.
- A failed model fetch retries once. The world can draw with simple shapes while assets load.
- A WebGL 2 startup failure opens a full-screen explanation with browser help.
- Storage tests cover old settings and a damaged Career save. World tests compare serialized bytes in all modes and sizes.
