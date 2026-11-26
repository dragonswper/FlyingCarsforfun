# Version 1.29 — Circuit Academy

The Training menu now includes **24 original drills in six packs**: First Touch,
Flight School, Last Line, Wall Reads, Redirects and Car Control. Pick any drill,
retry with the existing Reset binding, or advance with Next Shot. Gold, silver
and bronze medals, best times and attempts save on this browser. Academy results
do not award competitive wins or repeatable match XP.

Free Play has a toolbox for a ground pass, aerial pop, incoming defensive shot
and stopping the ball's velocity. The optional three-second trajectory guide
uses the existing collision-aware ball predictor; future car contacts are not
predicted. These tools only operate in solo offline free play.

Ordered driving gates use original low-poly Blender artwork, not downloaded
props. Source: `art/academy-guides.blend`; rebuild with
`blender --background --python scripts/create-academy-props.py`. The runtime GLB
is approximately 29 KB. Four pooled gates/cones and one reusable 91-point line
have no collision bodies. Guidance disappears in multiplayer and the main menu.
The panels support desktop, portrait phones and short landscape screens, with
scrolling content, fixed actions and 44-pixel minimum touch targets.

The app entry point is formatted for maintenance. The shared simulation,
vehicle/map catalogs, 120 Hz physics, 30 Hz binary snapshots and online protocol
are unchanged. Verified older clients remain compatible during deployment.
Friends, private lobbies and their shared car previews remain available.

## Validation

- Academy tests cover every spawn, ownership, objectives, timeouts, medals,
  retries, save sanitizing, offline boundaries and the exported Blender meshes.
- Browser acceptance drives a real shot to a gold medal, retries it, reloads to
  check persistence, and exercises the free-play tools. Layout checks cover
  desktop, phone portrait and phone landscape.
- The complete existing test suite, syntax checks and Cloudflare dry run run
  before release. Published assets and real HTTPS/WSS dedicated matchmaking,
  private games and reconnect are checked after deployment.

Progress is local to a browser profile. It is not a competitive ranking, a
cloud backup, or a physics/netcode change. Real phone frame rates and OCE latency
require testing on players' actual devices and connections.
