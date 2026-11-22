# 1.25.1 — aircraft corner clearance

The C-17's visible wingspan is approximately 1.94 m; the common driving collider is 0.842 m wide. Its 2 m body also extends beyond the common 1.1801 m collider. On a corner quarter-pipe, the mesh could intersect the ramp while the physical car was still correctly outside it. A reproduced boosted corner approach put part of the actual aircraft mesh 0.332 m inside the surface. The generated ramp sampled in that location differs from its analytic collision curve by approximately 7 mm, so a large ramp misalignment was not the cause.

The aircraft now has render-only surface clearance. A cached set of extreme points measured from the supplied GLB checks the shared arena dimensions, lower and upper quarter-pipes, corner planes and goal interiors. The body and exhaust shift out of visible penetration, then ease back when clear. Suspension animation is included. Measurement is prepared during vehicle loading and reused across aircraft clones; frames use bounded samples and scratch vectors instead of scanning triangles. Other vehicles do not run this extra guard.

The C-17 retains its source artwork, scale, wheel animation and shared car handling. This is a visual adjustment, not a new aircraft-shaped hitbox: ball/player collision reach remains the common car shape. Authoritative physics, guest prediction, network snapshots, scoring and field geometry are unchanged. Camera self-obstruction bounds follow the adjusted artwork.

## Verification

- Compare clearance equations with the authoritative surface query over 2,145 floor, roof, wall, corner and goal sample positions.
- Load the actual aircraft GLB and scan every vertex during simulated boosted approaches to all four corners, including suspension. Reproduce over 30 cm of overlap without the fix and keep corrected overlap within the 2.5 cm regression tolerance; assert that render correction never mutates the physical position or orientation.
- Check side-wall, upper transition, inverted roof and goal-interior poses; clearance settles back to zero on the open field and in the garage. Verify independent clone offsets and camera fading at the shifted body.
- Render the same Halloween Hollow corner in Chromium before/after: the reproduced overlap changes from 0.332 m to zero. Check both local simulation and rendered network snapshots, plus a phone-sized landscape viewport, without extra shader compilation on contact.
- All 447 automated tests, the JavaScript syntax check and Cloudflare dry-run pass before release. Verify the published build/assets and secure public multiplayer smoke check afterward.

To check in play, select **C-17 Globemaster**, use **Halloween Hollow**, boost diagonally into a corner and follow the ramp onto a wall. Repeat inverted near the roof and inside a goal, in car cam and ball cam. Both online players should reload for build `boost-circuit-1.25.1`. Software-rendered cloud checks do not measure physical-phone FPS or home-network latency.
