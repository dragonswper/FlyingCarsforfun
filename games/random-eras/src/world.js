import { buildLandscape, clamp, flattenPad, hashSeed, lerp, makeBiomes, makePathDistanceSquared, makePaths, noise, riverProfile, sampleGrid, seededRandom, smoothstep } from './landscape.js';

export const REGIONS = Object.freeze([
  Object.freeze({
    id: 'ironwood', name: 'Medieval Highlands', faction: 'Ironwood Wardens', era: 'Medieval', elevation: 0.7,
    ground: '#394d38', groundLight: '#6f8155', path: '#82745a',
    stone: '#676b65', foliage: '#354c32', accent: '#e2bd69',
    cloth: '#415d4f', skin: '#97684c', armor: '#776b53', buildingStyle: 'timber',
  }),
  Object.freeze({
    id: 'sunscar', name: 'Sunscar Basin', faction: 'Dune Kin', era: 'Ancient', elevation: -0.65, terrace: true,
    ground: '#92583c', groundLight: '#bf9060', path: '#bd9b73',
    stone: '#a77954', foliage: '#6e7048', accent: '#ffbc69',
    cloth: '#a75235', skin: '#885843', armor: '#ad8558', buildingStyle: 'sandstone',
  }),
  Object.freeze({
    id: 'frostfall', name: 'Frostfall Ridge', faction: 'Frostborne', era: 'Frontier', elevation: 3.5,
    ground: '#5a6b75', groundLight: '#a6b8b7', path: '#83969c',
    stone: '#65717c', foliage: '#496265', accent: '#bce3e8',
    cloth: '#58677b', skin: '#af8771', armor: '#7f8890', buildingStyle: 'steel',
  }),
  Object.freeze({
    id: 'glassreach', name: 'Glassreach', faction: 'Glassreach Scouts', era: 'Futuristic', elevation: 2.1,
    ground: '#514c67', groundLight: '#8b849d', path: '#9090a4',
    stone: '#716e8c', foliage: '#53576d', accent: '#c6affb',
    cloth: '#645174', skin: '#7a617e', armor: '#8583a3', buildingStyle: 'alloy',
  }),
  Object.freeze({
    id: 'flintwake', name: 'Flintwake Valley', faction: 'Flintwalkers', era: 'Stone', elevation: 0.25,
    ground: '#605745', groundLight: '#847451', path: '#a98d5a', stone: '#716956',
    foliage: '#4c5734', accent: '#bfa572', cloth: '#716347', skin: '#a57457',
    armor: '#685744', buildingStyle: 'megalith',
  }),
  Object.freeze({
    id: 'redcanopy', name: 'Redcanopy Hills', faction: 'Redcanopy Guard', era: 'Feudal', elevation: 1.6,
    ground: '#5d4f3e', groundLight: '#968053', path: '#9e7860', stone: '#62594d',
    foliage: '#8d4839', accent: '#e5836d', cloth: '#733e35', skin: '#ab8562',
    armor: '#6e594e', buildingStyle: 'pagoda',
  }),
  Object.freeze({
    id: 'ashline', name: 'Ashline District', faction: 'Ashline Salvagers', era: 'Modern', elevation: 0.12, terrace: true,
    ground: '#535751', groundLight: '#808278', path: '#89877b', stone: '#747a7a',
    foliage: '#505f47', accent: '#b4ad81', cloth: '#586366', skin: '#a27560',
    armor: '#727a7a', buildingStyle: 'concrete',
  }),
]);

export const WorldTuning = Object.freeze({
  sizes: Object.freeze({ small: 72, medium: 108, large: 156 }),
  sampleSpacing: 0.96,
  erosion: 0.78,
  terracing: 0.42,
  chunkSize: 26,
  doorWidth: 1.32,
  wallThickness: 0.22,
  roadGrade: 0.24,
  roadWidth: 1.35,
  roadBankWidth: 3.4,
});
const ARENA_SIZE = 26;
const ARENA_LIMIT = 9;
const FORT_WALL_OFFSET = 6.2;
const HALF_TURN = Math.PI;
const QUARTER_TURN = HALF_TURN / 2;

export function worldSettings(options = {}) {
  return {
    preset: Object.hasOwn(WorldTuning.sizes, options.preset) ? options.preset : 'medium',
    era: REGIONS.some(({ id }) => id === options.era) ? options.era : 'random',
  };
}

function frontierEnvironment({ regions, number, ridgePhase, size, terrain, paths, river }) {
  const biomes = makeBiomes(regions, number, ridgePhase, size);
  const height = (x, z) => sampleGrid(terrain, x, z);
  return {
    height, regionAt: biomes.regionAt, biomeWeights: biomes.mix, pathAt: makePaths(paths),
    waterAt(x, z) {
      const profile = riverProfile(river, z);
      return Math.abs(x - profile.x) < profile.width * 1.06 && height(x, z) < profile.y ? profile.y : null;
    },
  };
}

function ringEnvironment({ phases, regions }) {
  return {
    regionAt: () => regions[0], biomeWeights: () => [1], waterAt: () => null,
    pathAt: (x, z) => 1 - smoothstep(5, 8.6, Math.hypot(x, z)),
    height(x, z) {
      const variation = Math.cos(x * 0.64) * Math.cos(z * 0.58) * phases[0];
      return variation + smoothstep(8.75, 13, Math.max(Math.abs(x), Math.abs(z))) * 1.1;
    },
  };
}

function createFrontier(seed, number, settings) {
  const random = seededRandom(number);
  const size = WorldTuning.sizes[settings.preset];
  const scale = size / WorldTuning.sizes.medium;
  const range = (min, max) => lerp(min, max, random());
  const regions = [...REGIONS];
  for (let index = regions.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [regions[index], regions[other]] = [regions[other], regions[index]];
  }

  const quadrants = [
    { x: -1, z: 1 },
    { x: 1, z: 1 },
    { x: -1, z: -1 },
    { x: 1, z: -1 },
  ];
  const ridgePhase = range(0, 2 * HALF_TURN);

  const explicit = regions.findIndex(({ id }) => id === settings.era);
  if (explicit >= 0) [regions[0], regions[explicit]] = [regions[explicit], regions[0]];
  regions.length = 4;
  const biomes = makeBiomes(regions, number, ridgePhase, size);
  const regionAt = biomes.regionAt;
  const river = { phase: range(0, Math.PI * 2), width: range(1.65, 2.8), meander: range(4.3, 6.3) * scale,
    lake: range(-15, 15) * scale, lakeWidth: range(1.6, 4.7) * scale };
  const fortX = range(26.5, 29.5) * scale;
  const fortZ = range(26.5, 29.5) * scale;
  const fortElevation = range(2.7, 3.45);

  const forts = quadrants.map((quadrant, index) => {
    const region = regions[index];
    const x = quadrant.x * fortX;
    const z = quadrant.z * fortZ;
    const id = `fort-${region.id}`;
    const yaw = Math.atan2(x, z);
    const outwardX = x / Math.hypot(x, z);
    const outwardZ = z / Math.hypot(x, z);
    const spawn = {
      x: x + outwardX * 2.55 - outwardZ * 1.25,
      z: z + outwardZ * 2.55 + outwardX * 1.25,
      yaw, facing: yaw, region, fortId: id,
    };
    return {
      id, x, z, region, spawn,
      core: { id: `${id}-core`, x, y: fortElevation, z, ownerSlot: index, era: region.era, maxHealth: 100 },
      elevation: fortElevation,
    };
  });

  const crossroads = { x: range(-3, 3), z: range(-3, 3) };
  const routes = forts.map((fort) => {
    const side = Math.sign(fort.z);
    const gate = { x: fort.x, z: fort.z - side * 8.6 };
    const bend = { x: fort.x * 0.73 + range(-2, 2), z: fort.z * 0.47 + range(-2, 2) };
    // On small maps the bend still needs to lead away from the gate towers.
    bend.z = side * Math.min(side * bend.z, Math.abs(gate.z) - 0.75);
    return [fort, gate, bend, { x: fort.x * 0.39 + range(-1, 1), z: fort.z * 0.16 + range(-2, 2) }, crossroads];
  });
  const paths = routes.flatMap((route) => route.slice(1).map((point, index) => [route[index], point]));

  const pathAt = makePaths(paths);
  const distanceToPathSquared = makePathDistanceSquared(paths);
  const terrain = buildLandscape({ number, size, regions, mix: biomes.mix, pathAt, river, forts, routes, tuning: WorldTuning });
  const data = { seed, mode: 'frontier', number, ridgePhase, size, limit: size / 2 - 1.2,
    regions, forts, terrain, paths, river, settings, spawns: forts.map(({ spawn }) => spawn), props: [] };
  const environment = frontierEnvironment(data);
  const { height, waterAt } = environment;
  const { props } = data;
  const movement = createMovementMap(data.limit);
  const place = createPropPlacer(props, movement, regionAt);

  for (const fort of forts) {
    addFortProps(fort, place, movement);
  }

  const terrainThemes = {
    ironwood: { landmark: 'tree', vegetation: 'tuft', trees: 49, rocks: 15, details: 35 },
    sunscar: { landmark: 'pillar', vegetation: 'tuft', trees: 13, rocks: 27, details: 25 },
    frostfall: { landmark: 'tree', vegetation: 'tuft', trees: 30, rocks: 34, details: 22 },
    glassreach: { landmark: 'crystal', vegetation: 'crystal', trees: 11, rocks: 28, details: 33 },
    flintwake: { landmark: 'pillar', vegetation: 'tuft', trees: 26, rocks: 30, details: 27 },
    redcanopy: { landmark: 'tree', vegetation: 'tuft', trees: 42, rocks: 18, details: 27 },
    ashline: { landmark: 'ruin', vegetation: 'tuft', trees: 17, rocks: 24, details: 33 },
  };

  for (const [index, quadrant] of quadrants.entries()) {
    const region = regions[index];
    const theme = terrainThemes[region.id];
    const scatter = (kind, quantity, minScale, maxScale, collision = 0) => {
      quantity = Math.round(quantity * scale);
      let placed = 0;
      for (let attempt = 0; attempt < quantity * 12 && placed < quantity; attempt++) {
        const x = range(5, size / 2 - 3) * quadrant.x;
        const z = range(5, size / 2 - 3) * quadrant.z;
        const scale = range(minScale, maxScale);
        const spacing = Math.max(collision * scale + 0.45, 0.48);
        if (kind === 'tree' && noise(number + 771, x * .065, z * .065) < .30 && random() > .14) continue;
        if (regionAt(x, z) !== region || pathAt(x, z) > 0.27 || waterAt(x, z) !== null
          || Math.abs(height(x + 1, z) - height(x - 1, z)) > 2.05
          || Math.abs(height(x, z + 1) - height(x, z - 1)) > 2.05
          || !movement.canMove(x, z, spacing)) {
          continue;
        }
        if (forts.some((fort) => Math.max(Math.abs(x - fort.x), Math.abs(z - fort.z)) < 8.7)) {
          continue;
        }
        place(kind, x, z, {
          scale,
          rotation: range(-HALF_TURN, HALF_TURN),
          variant: Math.floor(range(0, 3)),
          radius: collision * scale,
        });
        placed++;
      }
    };

    const buildingWidth = range(2.35, 3.45);
    const buildingDepth = range(2.15, 3.2);
    const buildingHeight = range(2.35, 3.35);
    const pad = Math.max(buildingWidth, buildingDepth) * 0.68;
    let cottages = 0;
    const cottagesWanted = settings.preset === 'small' ? 1 : settings.preset === 'large' ? 3 : 2;
    for (let attempt = 0; attempt < 105 && cottages < cottagesWanted; attempt++) {
      const x = range(8, size / 2 - 6) * quadrant.x;
      const z = range(8, size / 2 - 6) * quadrant.z;
      const roadClearance = (Math.sqrt(distanceToPathSquared(x, z)) - WorldTuning.roadWidth - terrain.step) / Math.SQRT2;
      const fortClearance = Math.min(...forts.map((fort) => Math.max(Math.abs(x - fort.x), Math.abs(z - fort.z)))) - 8.7;
      const feather = Math.min(2.4, roadClearance - pad, fortClearance - pad);
      if (feather < 0.85 || waterAt(x, z) !== null || !movement.canMove(x, z, 2.75)) continue;
      flattenPad(terrain, x, z, pad, feather, height(x, z));
      place('building', x, z, {
        width: buildingWidth,
        height: buildingHeight,
        depth: buildingDepth,
        rotation: Math.floor(range(0, 4)) * QUARTER_TURN,
        variant: cottages, wear: range(0, 1),
        solid: true,
      });
      const pickupOffset = Math.max(buildingDepth, buildingWidth) / 2 + 0.59;
      if (movement.canMove(x, z + pickupOffset, .27)) {
        place('pickup', x, z + pickupOffset, { item: cottages ? 'stamina' : 'weapon', rarity: cottages ? 'common' : 'uncommon' });
      }
      cottages++;
    }

    scatter('tree', theme.trees, 0.75, 1.85, 0.35);
    scatter('rock', theme.rocks, 0.62, 2.1, 0.46);
    scatter(theme.vegetation, theme.details, 0.44, 1.35);
    scatter(theme.landmark, 8, 1.3, 2.3, 0.5);
    scatter('ruin', 3, 0.85, 1.7, 0.72);
  }

  return { ...data, ...environment, canMove: movement.canMove };
}

function addFortProps(fort, place, movement) {
  const { x, z, id } = fort;
  const offset = FORT_WALL_OFFSET;

  const wall = { width: 3.87, height: 2.1, depth: 0.62, solid: true, fortId: id };
  for (const side of [-1, 1]) {
    place('wall', x - 3.6, z + side * offset, wall);
    place('wall', x + 3.6, z + side * offset, wall);
    place('wall', x + side * offset, z - 3.6, { ...wall, rotation: QUARTER_TURN });
    place('wall', x + side * offset, z + 3.6, { ...wall, rotation: QUARTER_TURN });

    for (const corner of [-1, 1]) {
      place('tower', x + side * offset, z + corner * offset, {
        width: 1.92, depth: 1.92, height: 4.4, solid: true, fortId: id,
      });
    }

    place('banner', x + 2.1, z + side * offset, { scale: 1.1, fortId: id });
    place('banner', x - 2.1, z + side * offset, { scale: 1.1, fortId: id });
  }

  for (const side of [-1, 1]) {
    place('building', x + side * 3.85, z + side * 3.4, {
      width: 2.4, depth: 2.3, height: 2.45, rotation: side * QUARTER_TURN,
      solid: true, fortId: id,
    });
  }

  place('pickup', x + 4.25, z, { item: 'weapon', fortId: id });
  place('pickup', x - 4.25, z, { item: 'medkit', fortId: id });
  movement.addCircle(x, z, 0.76);
}

function createArena(seed, number, mode, settings) {
  const random = seededRandom(number ^ 0x1369ae7b);
  const region = REGIONS.find(({ id }) => id === settings.era)
    || (mode === 'training' ? REGIONS[0] : REGIONS[Math.floor(random() * REGIONS.length)]);
  const phases = [random() * 0.075 + 0.045];
  const props = [];
  const environment = ringEnvironment({ phases, regions: [region] });
  const { regionAt } = environment;
  const movement = createMovementMap(ARENA_LIMIT);
  const place = createPropPlacer(props, movement, regionAt);

  const wall = { width: 4.65, depth: 0.9, height: 2.6, solid: true };
  for (const side of [-1, 1]) {
    for (const offset of [-6.98, -2.33, 2.33, 6.98]) {
      const variant = Math.floor(random() * 3);
      place('wall', offset, side * 9.65, { ...wall, variant });
      place('wall', side * 9.65, offset, { ...wall, rotation: QUARTER_TURN, variant });
    }
    for (const corner of [-1, 1]) {
      place('tower', side * 9.65, corner * 9.65, { width: 2.6, depth: 2.6, height: 4.8, solid: true });
    }
    place('banner', -4.1, side * 9.1, { scale: 1.35 });
    place('banner', 4.1, side * 9.1, { scale: 1.35 });
    place('pillar', side * 7.25, -5.8, { scale: 1.4, radius: 0.55 });
    place('pillar', side * 7.25, 5.8, { scale: 1.4, radius: 0.55 });
  }

  for (let index = 0; index < 20; index++) {
    const angle = random() * 2 * HALF_TURN;
    const radius = 11.1 + random() * 1.6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.max(Math.abs(x), Math.abs(z)) < 10.25) continue;
    place(index % 3 ? 'rock' : 'ruin', x, z, {
      scale: 0.6 + random() * 1.15,
      rotation: random() * 2 * HALF_TURN,
    });
  }

  const spawns = [{ x: 0, z: 4.35, yaw: 0, facing: 0, region, fortId: null }];
  if (mode === 'training') {
    spawns.push(
      { x: 0, z: 0.65, drill: 'fixed' },
      { x: -4.5, z: 0.0, drill: 'fixed' },
      { x: -3.35, z: -3.4, drill: 'strafe' },
      { x: 3.6, z: -4.5, drill: 'quick' },
    );
    for (const spawn of spawns.slice(1)) Object.assign(spawn, { yaw: HALF_TURN, region });
    place('pickup', 4.1, 7.15, { item: 'stamina', rarity: 'common' });
  } else {
    spawns.push({ x: 0, z: -4.35, yaw: HALF_TURN, facing: HALF_TURN, region, fortId: null });
  }
  return { seed, mode, size: ARENA_SIZE, limit: ARENA_LIMIT, regions: [region], props, forts: [], spawns,
    ...environment, phases, settings, canMove: movement.canMove };

}

function createPropPlacer(props, movement, regionAt) {
  return (kind, x, z, options = {}) => {
    const { radius = 0, solid = false, ...appearance } = options;
    const region = regionAt(x, z);
    const prop = {
      id: `${kind}-${props.length}`,
      kind, x, z, region, era: region.era,
      collision: solid ? { kind: kind === 'building' ? 'shell' : 'box' } : radius ? { kind: 'circle', radius } : null,
      scale: 1, rotation: 0,
      ...appearance,
    };
    props.push(prop);
    if (solid && kind === 'building') movement.addShell(prop);
    else if (solid) movement.addBox(prop);
    if (radius) movement.addCircle(x, z, radius);
    return prop;
  };
}

function createMovementMap(limit) {
  const colliders = new Map();
  const cellSize = 4;
  const cellKey = (x, z) => `${x},${z}`;

  function visitCells(x, z, radius, visit) {
    const right = Math.floor((x + radius) / cellSize);
    const bottom = Math.floor((z + radius) / cellSize);
    for (let column = Math.floor((x - radius) / cellSize); column <= right; column++) {
      for (let row = Math.floor((z - radius) / cellSize); row <= bottom; row++) {
        if (visit(cellKey(column, row)) === false) return false;
      }
    }
    return true;
  }

  function addCollider(x, z, radius, overlaps) {
    visitCells(x, z, radius, (key) => {
      const cell = colliders.get(key);
      if (cell) cell.push(overlaps);
      else colliders.set(key, [overlaps]);
    });
  }

  function addCircle(x, z, radius) {
    addCollider(x, z, radius, (otherX, otherZ, otherRadius) => (
      (otherX - x) ** 2 + (otherZ - z) ** 2 < (radius + otherRadius) ** 2
    ));
  }

  function addBox({ x, z, width, depth, rotation }) {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    addCollider(x, z, Math.hypot(halfWidth, halfDepth), (otherX, otherZ, radius) => {
      const dx = otherX - x;
      const dz = otherZ - z;
      const localX = Math.abs(dx * cos - dz * sin);
      const localZ = Math.abs(dx * sin + dz * cos);
      const edgeX = Math.max(0, localX - halfWidth);
      const edgeZ = Math.max(0, localZ - halfDepth);
      return edgeX ** 2 + edgeZ ** 2 <= radius ** 2;
    });
  }

  function canMove(x, z, radius = 0.4) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0) {
      return false;
    }
    if (Math.abs(x) + radius > limit || Math.abs(z) + radius > limit) return false;
    return visitCells(x, z, radius, (key) => !colliders.get(key)?.some((overlaps) => overlaps(x, z, radius)));
  }

  function addShell({ x, z, width, depth, rotation }) {
    const thickness = WorldTuning.wallThickness;
    const post = (width - WorldTuning.doorWidth) / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const panel = (dx, dz, w, d) => addBox({ x: x + dx * cos + dz * sin, z: z - dx * sin + dz * cos, width: w, depth: d, rotation });
    const edgeX = (width - thickness) / 2;
    const edgeZ = (depth - thickness) / 2;
    panel(0, -edgeZ, width, thickness);
    for (const side of [-1, 1]) {
      panel(side * edgeX, 0, thickness, depth);
      panel(side * (width - post) / 2, edgeZ, post, thickness);
    }
  }

  return { addCircle, addBox, addShell, canMove };
}

export function createWorld(seed = 'RIFT-01', mode = 'frontier', options) {
  const label = String(seed).trim() || 'RIFT-01';
  const number = hashSeed(label);
  const settings = worldSettings(options);
  return mode === 'arena' || mode === 'training' ? createArena(label, number, mode, settings) : createFrontier(label, number, settings);
}

export function worldData(world) {
  const { height, regionAt, biomeWeights, pathAt, waterAt, canMove, ...data } = world;
  return data;
}

export function hydrateWorld(data) {
  const environment = data.mode === 'frontier' ? frontierEnvironment(data) : ringEnvironment(data);
  const movement = createMovementMap(data.limit);
  for (const prop of data.props) {
    if (prop.collision?.kind === 'box') movement.addBox(prop);
    if (prop.collision?.kind === 'shell') movement.addShell(prop);
    if (prop.collision?.kind === 'circle') movement.addCircle(prop.x, prop.z, prop.collision.radius);
  }
  for (const fort of data.forts) movement.addCircle(fort.x, fort.z, 0.76);
  return { ...data, ...environment, canMove: movement.canMove };
}
