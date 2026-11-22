# 1.25.0 — Natural turf, match points and bot teamplay

Play: https://flyingcarsforfun.connstors.workers.dev — reload every player for **boost-circuit-1.25.0**. The new shot counter travels in authoritative state, so players need the matching client/server build.

## Natural turf

Champions Field, Neon City, Evergreen Grove, Harbourworks, Halloween Hollow and Sunset Coast now have curved, tapered grass blades with root-to-tip shading, gentle wind and alternating mowing direction. A shared, locally generated fine-grain texture supplies ground color variation and small surface bumps between the leaves. The original field paint remains visible on both the turf surface and blades. Blade height stays between 4.5 and 7.5 cm; grass affects rendering only.

Detail is concentrated in a 24-metre patch around the player, with a dithered outer fade. This increases the visible density around the car while retaining one instanced grass draw. Buffers allocate on demand, grow to the selected budget and reuse capacity. Only a time/position uniform changes each frame. The ground detail uses one shared 256×256 generated texture.

| Graphics / grass choice | Blade instances | Blade triangles |
| --- | ---: | ---: |
| Low or Mobile preset | 0 | 0 |
| Balanced / desktop Auto at balanced tier | 8,000 | 40,000 |
| High preset | 18,000 | 90,000 |
| Cinematic preset | 48,000 | 240,000 |
| Grass: Low override | 12,000 | 60,000 |
| Grass: High override | 48,000 | 240,000 |

Use **Options → Display → Short Grass** to choose a preset, Low, High or Off. Low/Mobile skip ground bump/color detail by default, and Auto can drop to the low tier under load. These are bounded geometry budgets, not guaranteed frame rates on every device.

## Match points and results

Team score continues to count goals. Individual points now give clearer credit for attacking and defending:

| Action | Match points |
| --- | ---: |
| Goal | 100 |
| Assist | 50 |
| Defensive save | 50 |
| Direct shot on goal | 10 |

Shot/save awards use actual car-ball contacts. A direct shot projects the ball toward the opponent's clear goal mouth over at most 2.5 seconds, accounting for gravity and a rolling floor. A save requires an opponent-originating incoming threat near the own goal to be redirected away or delayed. The save path uses a shorter 1.8-second horizon. Bank-shot paths and long ricochets are outside this short direct-trajectory test. Repeated contact, backpasses and practice hits do not award these new match points. Attempt tracking and cooldowns prevent sustained touches from repeatedly earning points.

The offline simulation, browser host or dedicated authority awards points. Guest prediction supplies immediate contact feedback while received state supplies the points/counters. Numeric match counters and notification kinds/values are validated. Goals, assists and existing practice rewards retain their previous values.

The player scoreboard now includes Shots, with the point rules underneath. Open it with the existing keyboard/controller binding or tap/click the match timer; it has a touch-sized close button. Touch driving controls and the overlapping online-player badge hide while the scoreboard is open. Desktop and phone layouts keep all six columns visible.

Each player sees their own point notification during play and Match Points on the result screen. A winning-team MVP is selected by points, then goals, saves and player ID for deterministic ties. Practice sessions and drawn results omit MVP. New matches/rematches start their match counters from zero. Existing local XP/career progress remains available.

## Bot decisions

The four difficulty choices remain Rookie, Pro, All-Star and Expert, with their existing reaction/decision intervals, shared physical limits and finite boost.

- Kickoffs assign one taker per team, including human teammates. The nearest goes, with left-goes resolving close ties.
- Striker selection uses arrival time with a small switching margin to reduce repeated job changes. Support players occupy separate lanes and cover the back post in the defensive half.
- Attackers choose goal lanes away from goal-side defenders; defensive-half clears favor the sideline. Imminent own-goal threats take priority over boost collection.
- Support players protect the defensive area when choosing boost pads. Jump/dodge attempts focus on the attacking player rather than every teammate charging together.
- Expert uses aimed aerial boost and attitude damping. Bots can self-right from an inverted ground pose and drive down walls to recover.

A shared cached ball prediction remains in use. Bots submit the same ordinary controls as humans; the simulation applies fuel, speed and angular limits.

## Verification

All **443 automated tests** pass, including new scoring, replication, anti-repeat, counter validation, MVP, kickoff, defense, shot selection, recovery and turf-budget tests. Existing driving, guest prediction, reconnect, controller/mobile and arena checks pass. JavaScript syntax and the Cloudflare dry-run build are checked before release.

A real Chromium render check exercises the five-triangle leaves and ground shader, preset/Low/High/Off grass changes, actual GPU triangle counts, driving, and a scoreboard that fits desktop and portrait phone viewports. A two-context HTTPS/WSS fixture uses real simulation contacts to award Shot +10 and Save +50, verifies both clients' counters/toasts, ends with synchronized MVP and per-player points, then rematches to a different field with reset stats. The fixture-only setup routes remain outside production source.

Ten additional 180-second simulated duels alternated Expert/Rookie sides over five kickoff seeds: Expert scored 19 goals to Rookie's 15, with 4 wins, 2 losses and 4 draws. This small deterministic regression run checks basic relative behavior, not a competitive skill rating.

Browser checks use software-rendered Chromium in one cloud workspace. Physical phone frame rates, two separate home networks and Australian latency still require player testing. No paid service or new computer installation is required by this update.
