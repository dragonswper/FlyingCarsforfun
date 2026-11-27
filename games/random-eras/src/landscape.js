export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hashSeed(seed) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.codePointAt(0), 16777619);
  return value >>> 0;
}

export function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function lattice(seed, x, z) {
  let n = seed ^ Math.imul(x, 1597334677) ^ Math.imul(z, 3812015801);
  n = Math.imul(n ^ n >>> 16, 2146121005);
  n = Math.imul(n ^ n >>> 15, 2221713035);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

export function noise(seed, x, z) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const u = smoothstep(0, 1, x - cx);
  const v = smoothstep(0, 1, z - cz);
  return lerp(lerp(lattice(seed, cx, cz), lattice(seed, cx + 1, cz), u),
    lerp(lattice(seed, cx, cz + 1), lattice(seed, cx + 1, cz + 1), u), v);
}

function fractal(seed, x, z) {
  let value = 0;
  let weight = 0.53;
  for (let octave = 0; octave < 4; octave++) {
    value += weight * noise(seed + 1171 * octave, x, z);
    weight *= 0.48;
    x *= 2.04;
    z *= 2.04;
  }
  return value;
}

export function makeBiomes(regions, number, phase, size) {
  function mix(x, z) {
    const humidity = noise(number ^ 0xc0141a, x * 0.045 - 5, z * 0.045 + 14);
    const temperature = 0.64 - z / size * 0.38 + (noise(number, x * 0.033, z * 0.033) - 0.5) * 0.26;
    const elevated = noise(number ^ 0x38702, x * 0.035 + 19, z * 0.035 - 11);
    const bend = Math.sin(z * 0.085 + phase) * 5.0 + (humidity - 0.5) * 4.0;
    const rise = Math.cos(x * 0.08 + phase) * 5.0 + (temperature - elevated) * 3.5;
    const east = smoothstep(-11, 11, x - bend);
    const north = smoothstep(-11, 11, rise - z);
    return [(1 - east) * (1 - north), east * (1 - north), (1 - east) * north, east * north];
  }
  function regionAt(x, z) {
    const weights = mix(x, z);
    return regions[weights.indexOf(Math.max(...weights))];
  }
  return { mix, regionAt };
}

export function makePathDistanceSquared(paths) {
  return (x, z) => {
    let nearest = Infinity;
    for (const [from, to] of paths) {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const t = clamp(((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      nearest = Math.min(nearest, (x - from.x - dx * t) ** 2 + (z - from.z - dz * t) ** 2);
    }
    return nearest;
  };
}

export function makePaths(paths) {
  const distanceSquared = makePathDistanceSquared(paths);
  return (x, z) => 1 - smoothstep(0.62, 4.65, distanceSquared(x, z));
}

export function riverProfile(river, z) {
  if (!river) return null;
  const curve = Math.sin(z * 0.046 + river.phase) * river.meander + Math.sin(z * 0.11 + river.phase * 1.2) * 1.8;
  const lake = Math.exp(-(((z - river.lake) / 7.5) ** 2));
  return { x: curve, width: river.width + lake * river.lakeWidth, y: 0.10 + z * 0.004 };
}

export function routeDrainage(heights, width) {
  const level = new Float32Array(heights.length);
  const downstream = new Int32Array(heights.length).fill(-2);
  const order = [];
  const heap = [];
  const before = (a, b) => level[a] < level[b] || (level[a] === level[b] && a < b);

  function enter(index, outlet, height) {
    downstream[index] = outlet;
    level[index] = height;
    let at = heap.length;
    heap.push(index);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!before(index, heap[parent])) break;
      heap[at] = heap[parent];
      at = parent;
    }
    heap[at] = index;
  }

  function take() {
    const result = heap[0];
    const tail = heap.pop();
    if (!heap.length) return result;
    let at = 0;
    while (at * 2 + 1 < heap.length) {
      let child = at * 2 + 1;
      if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
      if (!before(heap[child], tail)) break;
      heap[at] = heap[child];
      at = child;
    }
    heap[at] = tail;
    return result;
  }

  // Work inland from the lowest outlets. Depressions inherit the spill level of their exit.
  for (let side = 0; side < width; side++) {
    enter(side, -1, heights[side]);
    const far = width * (width - 1) + side;
    enter(far, -1, heights[far]);
  }
  for (let row = 1; row < width - 1; row++) {
    const left = row * width;
    enter(left, -1, heights[left]);
    const right = left + width - 1;
    enter(right, -1, heights[right]);
  }
  while (heap.length) {
    const index = take();
    order.push(index);
    const x = index % width;
    const z = Math.floor(index / width);
    for (let row = Math.max(0, z - 1); row <= Math.min(width - 1, z + 1); row++) {
      for (let col = Math.max(0, x - 1); col <= Math.min(width - 1, x + 1); col++) {
        const next = row * width + col;
        if (downstream[next] === -2) enter(next, index, Math.max(heights[next], level[index]));
      }
    }
  }

  const flow = new Float32Array(heights.length).fill(1);
  for (let i = order.length - 1; i >= 0; i--) {
    const index = order[i];
    const outlet = downstream[index];
    if (outlet >= 0) flow[outlet] += flow[index];
  }
  return { flow, downstream };
}

function erode(heights, width, strength) {
  const shifts = new Float32Array(heights.length);
  for (let pass = 0; pass < 5; pass++) {
    shifts.fill(0);
    for (let z = 1; z < width - 1; z++) for (let x = 1; x < width - 1; x++) {
      const i = z * width + x;
      for (const neighbor of [i + 1, i + width]) {
        const difference = heights[i] - heights[neighbor];
        const transfer = Math.sign(difference) * Math.max(0, Math.abs(difference) - 0.88) * strength * 0.17;
        shifts[i] -= transfer;
        shifts[neighbor] += transfer;
      }
    }
    for (let i = 0; i < heights.length; i++) heights[i] += shifts[i];
  }

  const { flow, downstream } = routeDrainage(heights, width);
  const cut = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    const sink = downstream[i];
    if (sink < 0 || heights[sink] >= heights[i]) continue;
    const sediment = Math.min(0.39, Math.log1p(flow[i] - 1) * 0.07) * strength;
    cut[i] -= sediment;
    cut[sink] += sediment * 0.16;
  }
  for (let i = 0; i < heights.length; i++) heights[i] += cut[i];
  return flow;
}

function gradeRoads(grid, routes, river, tuning) {
  const edge = grid.size / 2;
  const gap = new Float32Array(grid.heights.length);
  const routeHeight = new Float32Array(grid.heights.length);
  const roadHeight = new Float32Array(grid.heights.length);
  const weightSum = new Float32Array(grid.heights.length);
  const coverage = new Float32Array(grid.heights.length);
  const maxGrade = tuning.roadGrade;
  const bankWidth = tuning.roadBankWidth;
  const roadWidth = tuning.roadWidth;

  function stamp(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = dx * dx + dz * dz || 1;
    const left = Math.floor((Math.min(from.x, to.x) + edge - bankWidth) / grid.step);
    const right = Math.ceil((Math.max(from.x, to.x) + edge + bankWidth) / grid.step);
    const top = Math.floor((Math.min(from.z, to.z) + edge - bankWidth) / grid.step);
    const bottom = Math.ceil((Math.max(from.z, to.z) + edge + bankWidth) / grid.step);
    for (let row = Math.max(0, top); row <= Math.min(grid.width - 1, bottom); row++) {
      for (let col = Math.max(0, left); col <= Math.min(grid.width - 1, right); col++) {
        const x = col * grid.step - edge;
        const z = row * grid.step - edge;
        const t = clamp(((x - from.x) * dx + (z - from.z) * dz) / length, 0, 1);
        const distance = Math.hypot(x - from.x - dx * t, z - from.z - dz * t);
        const index = row * grid.width + col;
        if (distance < bankWidth && distance < gap[index]) {
          gap[index] = distance;
          routeHeight[index] = lerp(from.y, to.y, t);
        }
      }
    }
  }

  for (const route of routes) {
    gap.fill(Infinity);
    const { x, z, elevation } = route[0];
    const points = [{ x, z, y: elevation }];
    let padEnd = 0;
    for (let segment = 1; segment < route.length; segment++) {
      const from = route[segment - 1];
      const to = route[segment];
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / grid.step));
      for (let i = 1; i <= steps; i++) {
        const x = lerp(from.x, to.x, i / steps);
        const z = lerp(from.z, to.z, i / steps);
        const stream = riverProfile(river, z);
        const nearWater = Math.abs(x - stream.x) <= stream.width * 1.23;
        const natural = sampleGrid(grid, x, z);
        const raised = nearWater ? Math.max(natural, stream.y + 0.28) : natural;
        const y = segment === 1 ? elevation : raised;
        points.push({ x, z, y });
      }
      if (segment === 1) padEnd = points.length - 1;
    }

    // Run the slope limit from both ends so the fort pad and the shared junction stay connected.
    for (let i = points.length - 2; i > padEnd; i--) {
      const anchor = points[i + 1];
      const point = points[i];
      const change = Math.hypot(point.x - anchor.x, point.z - anchor.z) * maxGrade;
      point.y = clamp(point.y, anchor.y - change, anchor.y + change);
    }
    for (let i = 1; i < points.length; i++) {
      const anchor = points[i - 1];
      const point = points[i];
      const change = Math.hypot(point.x - anchor.x, point.z - anchor.z) * maxGrade;
      point.y = clamp(point.y, anchor.y - change, anchor.y + change);
      stamp(anchor, point);
    }
    // At intersections, blend nearby grades to avoid a sudden seam between two roads.
    for (let i = 0; i < gap.length; i++) {
      if (gap[i] >= bankWidth) continue;
      const weight = (1 - smoothstep(0, bankWidth, gap[i])) ** 2;
      weightSum[i] += weight;
      roadHeight[i] += weight * routeHeight[i];
      coverage[i] = Math.max(coverage[i], 1 - smoothstep(roadWidth, bankWidth, gap[i]));
    }
  }
  for (let i = 0; i < grid.heights.length; i++) {
    if (weightSum[i] > 0) grid.heights[i] = lerp(grid.heights[i], roadHeight[i] / weightSum[i], coverage[i]);
  }
}

export function sampleGrid(grid, x, z, values = grid.heights) {
  const u = clamp((x + grid.size / 2) / grid.step, 0, grid.width - 1);
  const v = clamp((z + grid.size / 2) / grid.step, 0, grid.width - 1);
  const col = Math.min(grid.width - 2, Math.floor(u));
  const row = Math.min(grid.width - 2, Math.floor(v));
  const i = row * grid.width + col;
  return lerp(lerp(values[i], values[i + 1], u - col),
    lerp(values[i + grid.width], values[i + grid.width + 1], u - col), v - row);
}

export function flattenPad(grid, x, z, radius, feather, y) {
  const edge = grid.size / 2;
  for (let row = Math.max(0, Math.floor((z + edge - radius - feather) / grid.step));
    row <= Math.min(grid.width - 1, Math.ceil((z + edge + radius + feather) / grid.step)); row++) {
    for (let col = Math.max(0, Math.floor((x + edge - radius - feather) / grid.step));
      col <= Math.min(grid.width - 1, Math.ceil((x + edge + radius + feather) / grid.step)); col++) {
      const gap = Math.max(Math.abs(col * grid.step - edge - x), Math.abs(row * grid.step - edge - z));
      const index = row * grid.width + col;
      grid.heights[index] = lerp(y, grid.heights[index], smoothstep(radius, radius + feather, gap));
    }
  }
}

export function buildLandscape({ number, size, regions, mix, pathAt, river, forts, routes, tuning }) {
  const width = Math.ceil(size / tuning.sampleSpacing) + 1;
  const step = size / (width - 1);
  const heights = new Float32Array(width * width);
  const edge = size / 2;
  for (let row = 0; row < width; row++) for (let col = 0; col < width; col++) {
    const x = col * step - edge;
    const z = row * step - edge;
    const wx = x + (noise(number, x * 0.031 + 5, z * 0.031 - 12) - 0.5) * 19;
    const wz = z + (noise(number + 1021, x * 0.028 - 7, z * 0.028) - 0.5) * 19;
    const rolling = (fractal(number, wx * 0.043, wz * 0.043) - 0.32) * 8.1;
    const ridge = 1 - Math.abs(2 * fractal(number ^ 0x23c220, wx * 0.046 + 34, wz * 0.046) - 1);
    const billow = Math.abs(2 * noise(number ^ 0x11b85, wx * 0.076, wz * 0.076) - 1) * 1.8;
    const boundary = smoothstep(edge * 0.72, edge * 1.01, Math.max(Math.abs(x), Math.abs(z)));
    const weights = mix(x, z);
    const altitude = weights.reduce((sum, weight, i) => sum + weight * regions[i].elevation, 0);
    const dust = weights.reduce((sum, weight, i) => sum + (regions[i].terrace ? weight : 0), 0);
    const base = rolling + ridge ** 2.2 * 2.9 + billow + altitude + boundary * (4.1 + ridge * 9.1);
    heights[row * width + col] = lerp(base, Math.round(base * 1.2) / 1.2, dust * tuning.terracing);
  }
  const flow = erode(heights, width, tuning.erosion);
  const grid = { width, step, size, heights, flow };
  for (let row = 0; row < width; row++) for (let col = 0; col < width; col++) {
    const x = col * step - edge;
    const z = row * step - edge;
    const index = row * width + col;
    const stream = riverProfile(river, z);
    const dx = Math.abs(x - stream.x);
    const bank = 1 - smoothstep(stream.width * 0.62, stream.width * 2.15, dx);
    const ford = pathAt(x, z);
    const streamBed = stream.y - 0.84 + smoothstep(0, stream.width, dx) * 0.79;
    const drained = Math.min(0.22, Math.log1p(flow[index]) * 0.026);
    heights[index] = lerp(heights[index], streamBed - drained, bank);
    if (bank > 0 && ford > 0) heights[index] = lerp(heights[index], stream.y + 0.075, ford * bank);
  }
  for (const fort of forts) flattenPad(grid, fort.x, fort.z, 7.7, 6.0, fort.elevation);
  gradeRoads(grid, routes, river, tuning);
  // The road grades meet each courtyard without changing its spawn or core elevation.
  for (const fort of forts) flattenPad(grid, fort.x, fort.z, 7.7, 2.3, fort.elevation);
  return grid;
}
