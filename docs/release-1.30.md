# Version 1.30 — Cup & Clubhouse

## Circuit Cup

Open **Exhibition → Circuit Cup** for an offline eight-car knockout. Play your
quarter-final, semi-final and final using the existing full car/ball simulation;
other bracket fixtures receive generated bot results. Club division increases
from Rookie to Pro to All-Star; Elite increases from Pro to All-Star to Expert.
Choose two- or five-minute games. Each Cup selects three distinct random fields.

Results and the next fixture save between rounds. Closing the browser or leaving
an unfinished match restarts that fixture, rather than restoring a partial
physics state. Elimination and championship brackets remain viewable. Cup
matches count toward local career stats. This is a solo tournament, not an
online tournament service or a ranked queue.

Winning displays an original trophy in the solo showroom. Its hollow cup,
hexagonal plinth and three victory fins were modelled in Blender. The editable
`art/circuit-cup.blend` and `scripts/create-club-trophy.py` are included. Runtime:
approximately 52 KB, four mesh draws, no image textures, lazy loaded after a win.
It stays hidden during gameplay and shared friend-lobby previews.

## Local career

The Career menu becomes a Clubhouse with:

- Eight headline stats, per-mode records and recent results.
- Twenty milestones covering wins, scoring, saves, assists, streaks, overtime,
  Academy medals and Cup victories. Each XP bonus pays once.
- Three deterministic daily challenges, resetting at the device's local
  midnight. Exhibition, Cup and online matches count; free-play touches and
  Academy retries do not farm match challenges.
- Four boost colours, three goal-celebration colour choices, three profile
  banners and milestone-unlocked player titles. These are local presentation
  choices; they do not change physics or claim a server-verified rank.
- Export/import for local progress. Backups include career, Cup, Academy, styles
  and aggregate XP/stats, excluding connection credentials, friend-device
  secrets, key bindings and audio preferences. Import is available from the
  main menu; malformed files show an error and oversized files are rejected.

Existing aggregate matches, wins, goals and touches carry forward. Per-mode,
save, assist and streak records begin with this update. Career remains stored
on this browser; exporting a backup is the way to move it to another browser.

## Performance and compatibility

Boost colours reuse existing flame meshes. Goal celebrations reuse the bounded
128-particle pool and respect Reduced Motion. The trophy adds no gameplay draw
calls. Panels have scrollable bodies, fixed footer actions and minimum 44 px
primary touch targets. No paid service, background game server or PC install is
introduced. Online physics and the binary snapshot format remain unchanged;
verified v1.29/v1.28/v1.27 clients can join during deployment.

## Validation

All **519 automated tests**, recursive syntax checks and the Cloudflare dry-run
pass. New coverage exercises complete three-round brackets, elimination,
interrupted-match recovery, malformed saves, deterministic daily resets,
idempotent XP, save migration, cosmetic boundaries and the original GLB.

Browser acceptance checks the 20 milestones, three daily tasks, cosmetic
persistence, backup round-trip/error handling, phone layouts and a complete
real-time two-minute Cup final. Real-simulation Academy shooting/recovery and friend invite/shared-showroom
integration checks remain in the full suite. Published asset hashes and real public HTTPS/WSS
private games, matchmaking and reconnect are checked after deployment.

These are functional software-rendered tests, not a promise of zero lag or
measured frame rates on every phone. OCE players' real latency still depends on
routing, the authority's location and their connections.
