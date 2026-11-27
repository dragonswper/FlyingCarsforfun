import { riverProfile, seededRandom } from './landscape.js';

export const EraWeather = Object.freeze({
  flintwake: { haze: '#aa987b', sky: '#554b45', drift: '#e5c097', far: 94, note: 'Smoke hangs low over the stones.' },
  sunscar: { haze: '#d3a075', sky: '#744639', drift: '#ecc89d', far: 88, note: 'Keep the sun at your shoulder.' },
  ironwood: { haze: '#a8b390', sky: '#515d56', drift: '#d0b061', far: 111, note: 'Follow the old timber road.' },
  redcanopy: { haze: '#c29578', sky: '#704641', drift: '#d87554', far: 100, note: 'The market closes at dusk.' },
  frostfall: { haze: '#bacad2', sky: '#4d6172', drift: '#e0edf1', far: 86, note: 'Snow muffles the ridge.' },
  ashline: { haze: '#a7a096', sky: '#5c5e5b', drift: '#a9a69e', far: 96, note: 'Mind the old road.' },
  glassreach: { haze: '#aaa2b9', sky: '#4c475f', drift: '#baacc9', far: 124, note: 'The beacons are still lit.' },
});

const landmarks = {
  flintwake: ['flintwake_standing_a', 'flintwake_bone_a'], sunscar: ['sunscar_hut_a'],
  ironwood: ['ironwood_banner_a'], redcanopy: ['redcanopy_stall_a'],
  frostfall: ['frostfall_lookout_a'], ashline: ['ashline_wreck_a'], glassreach: ['glassreach_pylon_a'],
};

export function eraDressing(world) {
  if (world.mode !== 'frontier') return [];
  // A separate random stream leaves the heights, spawns and existing placements byte-for-byte stable.
  const random = seededRandom(world.number ^ 0x18d40c);
  const props = [];
  for (const fort of world.forts) {
    const { x, z, region } = fort;
    props.push({ x: x - Math.sign(x) * 3, z: z + Math.sign(z) * 1.7, type: 'ironwood_fire_a', scale: 0.95, region });
    const types = landmarks[region.id];
    let placed = 0;
    for (let i = 0; i < 100 && placed < 4; i++) {
      const px = x + (random() - 0.5) * 32;
      const pz = z + (random() - 0.5) * 32;
      if (Math.hypot(px - x, pz - z) < 10 || world.regionAt(px, pz).id !== region.id
        || world.pathAt(px, pz) > 0.06 || world.waterAt(px, pz) !== null || !world.canMove(px, pz, 1.4)
        || props.some((prop) => Math.hypot(prop.x - px, prop.z - pz) < 4)) continue;
      props.push({ x: px, z: pz, type: types[placed % types.length], scale: 0.9 + random() * 0.35, region, rotation: random() * Math.PI * 2 });
      placed++;
    }
  }

  const crossing = world.paths.find(([a, b]) => {
    const first = riverProfile(world.river, a.z);
    const second = riverProfile(world.river, b.z);
    return (a.x - first.x) * (b.x - second.x) < -0.9;
  });
  if (crossing) {
    const [a, b] = crossing;
    let center;
    for (let i = 1; i < 20; i++) {
      const t = i / 20;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const river = riverProfile(world.river, z);
      const edge = Math.abs(x - river.x);
      if (!center || edge < center.edge) center = { x, z, edge };
    }
    if (center && world.waterAt(center.x, center.z) === null) {
      props.push({ ...center, type: 'ironwood_bridge_a', scale: 1, region: world.regionAt(center.x, center.z),
        rotation: Math.atan2(b.x - a.x, b.z - a.z) });
    }
  }
  return props;
}
