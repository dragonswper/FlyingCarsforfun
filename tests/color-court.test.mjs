import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {C} from '../dist/constants.js';
import {HOOPS} from '../dist/hoops-physics.js';
import {configureArtDirection, SceneryArt} from '../dist/art-direction.js';
import {SECURITY_HEADERS} from '../server/http/security.mjs';
async function load(id) {
  const bytes = readFileSync(
      new URL('../dist/assets/overdrive/' + id + '.glb', import.meta.url),
    ),
    report = JSON.parse(
      readFileSync(
        new URL('../dist/assets/overdrive/' + id + '.json', import.meta.url),
      ),
    );
  assert.equal(createHash('sha256').update(bytes).digest('hex'), report.sha256);
  assert.equal(bytes.length, report.bytes);
  assert.equal(report.originalArtwork, true);
  assert.equal(report.textures, 0);
  assert.ok(
    statSync(new URL('../' + report.sourceBlend, import.meta.url)).size > 50000,
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    '',
  );
  return {root: gltf.scene, report};
}
test('the vibrant display transform installs once and keeps ACES highlight rolloff without another render pass', () => {
  const a = {},
    b = {};
  configureArtDirection(a);
  const chunk = T.ShaderChunk.tonemapping_pars_fragment;
  configureArtDirection(b);
  assert.equal(a.toneMapping, T.CustomToneMapping);
  assert.equal(b.toneMapping, T.CustomToneMapping);
  assert.equal(T.ShaderChunk.tonemapping_pars_fragment, chunk);
  assert.match(chunk, /mapped = ACESFilmicToneMapping/);
  assert.equal((chunk.match(/float vibrance =/g) || []).length, 1);
});
test('scenery shares toon materials while preserving textures, custom wind shaders and transparent glass', () => {
  const art = new SceneryArt(),
    root = new T.Group(),
    texture = new T.Texture(),
    source = new T.MeshStandardMaterial({color: '#387951', map: texture}),
    before = source.color.clone(),
    a = new T.Mesh(new T.BoxGeometry(), source),
    b = new T.Mesh(a.geometry, source),
    glass = new T.Mesh(
      a.geometry,
      new T.MeshStandardMaterial({transparent: true, opacity: 0.2}),
    ),
    wind = new T.Mesh(a.geometry, new T.MeshStandardMaterial());
  wind.material.onBeforeCompile = () => {};
  const custom = wind.material;
  root.add(a, b, glass, wind);
  art.apply(root);
  assert.equal(a.material, b.material);
  assert.equal(a.material.isMeshToonMaterial, true);
  assert.equal(a.material.map, texture);
  assert.ok(source.color.equals(before));
  assert.equal(glass.material.isMeshStandardMaterial, true);
  assert.equal(wind.material, custom);
  const size = art.materials.size;
  art.apply(root);
  assert.equal(art.materials.size, size);
  art.dispose();
});
test('original Blender Hoops bowl is bounded to nine draws and stays outside the playable enclosure', async () => {
  const {root, report} = await load('hoops-arena');
  assert.equal(report.meshBatches, 9);
  assert.ok(report.triangles < 30000 && report.bytes < 1500000);
  root.updateMatrixWorld(true);
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const p = o.geometry.attributes.position,
      v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      assert.ok(
        v.y < 0 ||
          v.y > C.height ||
          Math.abs(v.x) > C.halfWidth ||
          Math.abs(v.z) > C.halfLength,
        'Decoration entered the playing enclosure.',
      );
    }
  });
  assert.equal(meshes, 9);
  assert.ok(root.getObjectByName('Pitch_Center'));
});
test('new framed baskets retain the existing authoritative rim/backboard calibration and full-height woven net', async () => {
  const {root, report} = await load('hoops-basket-v2');
  root.updateMatrixWorld(true);
  const rim = root.getObjectByName('Hoops_Rim'),
    board = root.getObjectByName('Hoops_Backboard'),
    net = root.getObjectByName('Hoops_Net');
  assert.ok(
    rim &&
      board &&
      net &&
      root.getObjectByName('Hoops_Backboard_Frame') &&
      root.getObjectByName('Hoops_Shooting_Square'),
  );
  assert.ok(Math.abs(rim.position.y - HOOPS.height) < 0.001);
  assert.ok(Math.abs(board.position.z - (HOOPS.boardZ - HOOPS.z)) < 0.001);
  rim.geometry.computeBoundingBox();
  assert.ok(
    Math.abs(
      rim.geometry.boundingBox.max.x -
        rim.geometry.boundingBox.min.x -
        (HOOPS.radius + HOOPS.tube) * 2,
    ) < 0.01,
  );
  assert.ok(new T.Box3().setFromObject(net).min.y < 0.4);
  assert.ok(report.triangles < 6000 && report.bytes < 200000);
});
test('the security policy permits local GLB texture decoding while retaining encrypted network and script restrictions', () => {
  const csp = SECURITY_HEADERS['Content-Security-Policy'];
  assert.match(csp, /connect-src 'self' blob: https: wss:/);
  assert.match(csp, /script-src 'self';/);
  assert.ok(!/connect-src[^;]*\shttp:|unsafe-eval/.test(csp));
});

test('concurrent Hoops preparation waits for both Blender downloads and creates only one shared bowl', async () => {
  const {SportView} = await import('../dist/overdrive/sport-view.js'),
    original = GLTFLoader.prototype.loadAsync,
    calls = [];
  let release;
  const venue = new Promise((resolve) => (release = resolve)),
    basket = new T.Group(),
    board = new T.Mesh(
      new T.BoxGeometry(14, 7, 0.12),
      new T.MeshStandardMaterial(),
    );
  board.name = 'Hoops_Backboard';
  basket.add(board);
  GLTFLoader.prototype.loadAsync = function (path) {
    calls.push(path);
    return path.includes('basket') ? Promise.resolve({scene: basket}) : venue;
  };
  const sports = new SportView(new T.Scene());
  try {
    let completed = 0;
    const first = sports.prepare('hoops').then(() => completed++),
      second = sports.prepare('hoops').then(() => completed++);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(completed, 0);
    assert.equal(sports.hoops.length, 0);
    release({scene: new T.Group()});
    await Promise.all([first, second]);
    assert.equal(calls.length, 2);
    assert.equal(sports.hoops.length, 2);
    assert.ok(sports.enclosure);
    await sports.prepare('hoops');
    assert.equal(calls.length, 2);
  } finally {
    GLTFLoader.prototype.loadAsync = original;
    sports.dispose();
  }
});
