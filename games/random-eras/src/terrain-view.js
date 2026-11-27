import * as THREE from 'three';
import { riverProfile } from './landscape.js';
import { WorldTuning } from './world.js';

const clamp = THREE.MathUtils.clamp;

function shade(x, z, salt) {
  const n = Math.sin(x * 109.17 + z * 71.7 + salt * 51.31) * 43758.55;
  return n - Math.floor(n);
}

function makeChunk(world, left, top, size, detail, material) {
  const samples = [];
  const positions = [];
  const colors = [];
  const palette = world.regions.map((region) => ({
    ground: new THREE.Color(region.ground), light: new THREE.Color(region.groundLight),
    stone: new THREE.Color(region.stone), path: new THREE.Color(region.path),
  }));
  const tone = new THREE.Color();
  const base = new THREE.Color();
  const gravel = new THREE.Color();
  const trail = new THREE.Color();
  const step = size / detail;
  const width = detail + 1;

  for (let row = 0; row <= detail; row++) for (let col = 0; col <= detail; col++) {
    const x = left + col * step;
    const z = top + row * step;
    const y = world.height(x, z);
    const grade = Math.hypot(world.height(x + .6, z) - world.height(x - .6, z),
      world.height(x, z + .6) - world.height(x, z - .6)) / 1.2;
    const fleck = shade(Math.round(x * 4), Math.round(z * 4), 4);
    const bright = clamp(0.27 + (y - 3.3) * 0.041 + fleck * 0.23, .13, .74);
    const slope = clamp((grade - 0.28) * 0.87, 0, 0.84);
    const weights = world.biomeWeights(x, z);
    tone.setRGB(0, 0, 0);
    gravel.setRGB(0, 0, 0);
    trail.setRGB(0, 0, 0);
    for (const [index, paint] of palette.entries()) {
      tone.add(base.copy(paint.ground).lerp(paint.light, bright).multiplyScalar(weights[index]));
      gravel.add(base.copy(paint.stone).multiplyScalar(weights[index]));
      trail.add(base.copy(paint.path).multiplyScalar(weights[index]));
    }
    tone.lerp(gravel, slope).lerp(trail, world.pathAt(x, z) * (world.mode === 'frontier' ? .64 : .35));
    samples.push([x, y, z, tone.r, tone.g, tone.b]);
  }

  function vertex(index, darken = 1, down = 0) {
    const [x, y, z, r, g, b] = samples[index];
    positions.push(x, y - down, z);
    colors.push(r * darken, g * darken, b * darken);
  }

  for (let row = 0; row < detail; row++) for (let col = 0; col < detail; col++) {
    const a = row * width + col;
    const b = a + 1;
    const c = a + width;
    const d = c + 1;
    const tint = .95 + shade(left + col, top + row, detail) * .095;
    for (const index of (row + col) % 2 ? [a, c, d, a, d, b] : [a, c, b, b, c, d]) vertex(index, tint);
  }
  // A skirt covers height differences at coarse/detailed edges while both LODs share sample coordinates.
  for (let i = 0; i < detail; i++) {
    for (const [a, b] of [[i, i + 1], [i * width + detail, (i + 1) * width + detail],
      [detail * width + i + 1, detail * width + i], [(i + 1) * width, i * width]]) {
      vertex(a, .91);
      vertex(b, .91);
      vertex(b, .72, 3.4);
      vertex(a, .91);
      vertex(b, .72, 3.4);
      vertex(a, .72, 3.4);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function makeRiver(world) {
  const positions = [];
  const index = [];
  const steps = Math.ceil(world.size);
  for (let i = 0; i <= steps; i++) {
    const z = (i / steps - .5) * world.size;
    const profile = riverProfile(world.river, z);
    positions.push(profile.x - profile.width * 1.13, profile.y + .018, z, profile.x + profile.width * 1.13, profile.y + .018, z);
    if (i < steps) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: '#598c88', transparent: true, opacity: .82, depthWrite: false }));
}

export function createTerrainView(world) {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const count = world.mode === 'frontier' ? Math.ceil(world.size / WorldTuning.chunkSize) : 1;
  const size = world.size / count;
  const chunks = [];
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
    const x = -world.size / 2 + col * size;
    const z = -world.size / 2 + row * size;
    const coarse = makeChunk(world, x, z, size, count === 1 ? 26 : 7, material);
    group.add(coarse);
    chunks.push({ x, z, coarse, detail: null, tier: 0 });
  }
  if (world.river) group.add(makeRiver(world));
  const qualityTiers = { low: 0, medium: 1, high: 2, ultra: 3 };

  function update(position, quality) {
    if (count === 1) return 1;
    const tier = qualityTiers[quality] ?? 1;
    const detail = 12 + tier * 5;
    const radius = size * (.9 + tier * .33);
    let next = null;
    let nearest = Infinity;
    let shown = 0;
    for (const chunk of chunks) {
      const gap = Math.hypot(position.x - chunk.x - size / 2, position.z - chunk.z - size / 2);
      const wantsDetail = gap < radius + (chunk.detail?.visible ? size * .24 : 0);
      if (wantsDetail && (!chunk.detail || chunk.tier !== tier) && gap < nearest) {
        next = chunk;
        nearest = gap;
      }
      if (chunk.detail) chunk.detail.visible = Boolean(wantsDetail);
      chunk.coarse.visible = !chunk.detail?.visible;
      if (chunk.detail?.visible) shown++;
    }
    if (next) {
      if (next.detail) {
        next.detail.geometry.dispose();
        group.remove(next.detail);
      }
      next.detail = makeChunk(world, next.x, next.z, size, detail, material);
      next.tier = tier;
      next.coarse.visible = false;
      group.add(next.detail);
      shown++;
    }
    return shown;
  }

  return { group, count: chunks.length, update };
}
