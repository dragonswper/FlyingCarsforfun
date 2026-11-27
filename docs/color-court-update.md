# Colour Court — visual update for v1.31

Fields and scenery now use a brighter illustrated finish. Hoops uses a new
original arena and basket set, guided by the supplied hardwood-court references.
Refresh the browser to receive the new presentation. Physics, protocol/build
compatibility, scoring dimensions, saved progress and admin settings are unchanged.

## Field and scenery finish

- Richer turf colours and clearer mowing bands across the arena themes.
- Shared four-band toon lighting for ordinary opaque scenery, including imported
  stadium architecture. Glass and custom wind/snow shaders keep their behaviour;
  vehicle artwork and garage paint remain intact.
- A small vibrance adjustment retains ACES highlight rolloff. It runs inside the
  existing material shaders, without a bloom or full-screen postprocessing pass.
- Lighter transparent ceiling/ramp surfaces preserve the visible driveable
  boundary while reducing the pale overlay on the pitch.

## Hoops

The new court has original plank grain, painted blue/orange keys, three-point
arcs, free-throw circles, white boundary markings and a Boost Circuit centre mark.
Team paint aligns with the actual blue and orange baskets. The wood has its own
finish, rather than reusing the turf material. Switching back to football restores
the original field material; rematches reuse the same generated court texture.

Baskets have bright team-coloured rims and frames, transparent backboards,
white target squares and tapered diamond nets extending toward the floor. The
surrounding bowl has tiered seating, a roof canopy, light strips, readable original
signage and a skyline beyond the stands. The ordinary Skyline environment is
hidden while this bowl is active so the two stands do not overlap.

Rim radius **4.6 m**, rim height **5.8 m**, backboard width **14 m** and its
**6–13 m** height range remain calibrated to the existing Hoops collision rules.
The new net is decorative; the existing rim/backboard contacts and downward
basket scoring remain authoritative. The same 34 boost pads are retained.

Both Blender downloads finish before the arena is ready. Concurrent preparation
requests share one load instead of displaying a partially loaded bowl.

## Original Blender sources

- `art/skyline-hoops.blend` — the bowl, seating, canopy, signage and skyline.
- `art/hoops-basket-v2.blend` — the rim, board, frame, target and woven net.
- `scripts/create-hoops-court.py` — reproducible original geometry generator.
- `dist/assets/overdrive/hoops-arena.*` and `hoops-basket-v2.*` — runtime GLBs and
  reports with calibration, source paths, counts and SHA-256 hashes.

The bowl uses nine material batches and 23,660 triangles. Each basket uses six
mesh batches and 2,168 triangles. Together the two downloads are about 1.4 MB,
with no embedded image textures. Both baskets share source geometry. The previous
basket file stays available for cached v1.31 clients. These new original assets
are MIT licensed; previously supplied vehicle/stadium artwork keeps its existing
separate attribution and rights.

## Embedded texture correction

The security policy had blocked some local `blob:` fetches used by GLTFLoader to
decode textures embedded in 3D models. This could leave those models untextured.
The connection policy now permits that local in-memory decode path. Network
connections still require HTTPS/WSS, scripts remain restricted, and the private
admin APIs keep their authentication checks. No secret or email setting is placed
in the public bundle.

## Validation

All **570 automated tests**, recursive syntax checks and the Cloudflare dry-run
pass. New checks cover shared materials, shader installation, original asset
hashes, geometry outside the playable enclosure, rim/backboard calibration,
concurrent asset loading and the texture policy.

Browser checks render Hoops, Champions Field, Evergreen Grove and Winterlight
Park with loaded model textures and no blocked texture requests. They also check
team-colour orientation, restoring the turf after Hoops, reusing the wood
material/texture, mobile controls, solo challenges and replay recording/playback.
The court texture remains unchanged across rendered frames. These are functional
cloud-rendered checks, not measured frame rates on every physical phone.
