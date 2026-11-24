# Presentation animation

This folder owns visual motion. Physics, collision, input prediction and network
snapshots remain in their shared gameplay modules. Never animate a vehicle's
simulation root or alter collision dimensions to produce a visual effect.

`AnimationSystem` provides one bounded presentation clock and reuses an input
state object across vehicle rigs. `begin(dt)` clamps hidden-tab gaps to 100 ms.
The system reads the device's reduced-motion preference each frame; Display →
Animation Motion can override it locally with Full or Reduced.

| Module | Responsibility | Budget |
| --- | --- | --- |
| `vehicle.js` | Signed wheel rotation, Ackermann steering, acceleration lean, landing compression | Each vehicle's existing rig; no new draws |
| `novelty.js` | Supplied skeletal/action clips, driven by speed and grounded state | Existing action/mixer only |
| `boost.js` | Smooth ignition/release and restrained exhaust flutter | Existing exhaust meshes, one WeakMap record per rig |
| `field.js` | Instanced pad bob, rotation, pickup hiding and eased respawn | Three existing instanced draws for all 34 pads |
| `environment.js` | Wind for explicitly named foliage; frozen transforms stay frozen | Shader uniforms, cloned materials once per field |
| `flags.js` | Original Blender cloth pennants and goal celebration envelope | Four flags + four poles in two instanced draws |

All 16 garage bodies use the vehicle driver. Characters retain their supplied
clips. The two procedural original bodies now have isolated chassis groups too.
Landing compression is capped at 2.5 cm; wheels stay at their calibrated rest
positions. The shared aircraft surface/camera guards remain active.

Every field uses the pennants; existing snowfall and grass use the same ambient
clock. Flags sit outside the collision enclosure. Reduced motion disables wind,
cloth waving, pad bob/rotation, chassis rocking and exhaust flutter, and freezes
ambient snowfall/grass movement. Wheels, steering and supplied locomotion clips
remain responsive. Pickup visibility and goals still convey gameplay state.

The pennant mesh is **original Blender artwork** in
[`art/stadium-pennant.blend`](../../art/stadium-pennant.blend). Its shape keys are
an artist preview; runtime wind runs on the GPU using the anchored UV gradient.
Rebuild with `blender --background --python scripts/create-animation-props.py`
from the repository root. The export is 192 triangles, about 6 KB, no textures.

For another animated prop, prepare its resources during loading, register a
bounded driver here, update only the selected field and release owned materials
on disposal. Do not add frame timers, unbounded particles, per-car listeners or
additional network packets. Rigid ramps, goals and buildings stay stable.
