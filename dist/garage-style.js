import {Box3, Vector3} from './vendor/three.module.js';
export const WHEEL_COLOURS = Object.freeze({
  stock: null,
  silver: '#c9d3de',
  gold: '#d3a553',
  black: '#263445',
  cyan: '#65d9ee',
  rose: '#dd8c99',
});
export const DECALS = Object.freeze({
  none: 'SOLID PAINT',
  racing: 'RACING STRIPES',
  chevron: 'CHEVRON',
  checkers: 'CHECKER FINISH',
});
export function garageStyle(raw = {}) {
  return {
    wheels: Object.hasOwn(WHEEL_COLOURS, raw?.wheels) ? raw.wheels : 'stock',
    decal: Object.hasOwn(DECALS, raw?.decal) ? raw.decal : 'none',
  };
}
// Style only existing presentation materials before the camera guard captures
// them. No new draws, textures, root transforms or collision shapes are added.
export function styleVehicle(model, raw) {
  const style = garageStyle(raw);
  model.garageStyle = style;
  if (style.wheels !== 'stock') {
    const copies = new Map();
    for (const wheel of model.wheels || [])
      (wheel.rolling || wheel.pivot)?.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material))
          return;
        const m = mesh.material,
          name = (mesh.name + ' ' + m.name).toLowerCase();
        if (/tire|tyre|rubber|brake|caliper/.test(name)) return;
        if (!/rim|hub|alloy|chrome|spoke/.test(name) && !(m.metalness > 0.6))
          return;
        if (!copies.has(m)) {
          const copy = m.clone();
          copy.color.set(WHEEL_COLOURS[style.wheels]);
          copies.set(m, copy);
        }
        mesh.material = copies.get(m);
      });
  }
  if (style.decal === 'none' || !model.paint) return;
  const material = model.paint,
    bounds = new Box3();
  model.root.traverse((mesh) => {
    if (mesh.isMesh && mesh.material === material) {
      mesh.geometry.computeBoundingBox();
      bounds.union(mesh.geometry.boundingBox);
    }
  });
  const size = bounds.getSize(new Vector3()),
    scale = new Vector3(
      1 / Math.max(0.01, size.x),
      1 / Math.max(0.01, size.y),
      1 / Math.max(0.01, size.z),
    );
  const before = material.onBeforeCompile?.bind(material),
    key = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader) => {
    before?.(shader);
    shader.uniforms.circuitDecalScale = {value: scale};
    shader.vertexShader = 'varying vec3 circuitLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ncircuitLocal=position;',
    );
    shader.fragmentShader =
      'varying vec3 circuitLocal;\nuniform vec3 circuitDecalScale;\n' +
      shader.fragmentShader;
    const mask = {
      racing: '1.-smoothstep(.09,.12,abs(abs(p.x)-.18))',
      chevron: '1.-smoothstep(.07,.10,abs(fract((p.z+abs(p.x))*.95)-.5))',
      checkers: 'mod(floor(p.x*8.)+floor(p.z*12.),2.)*.6',
    }[style.decal];
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\nvec3 p=circuitLocal*circuitDecalScale;float decalMask=${mask};diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.88,.93,.96),decalMask*.78);`,
    );
  };
  material.customProgramCacheKey = () =>
    String(key?.() || '') + '-circuit-decal-' + style.decal;
  material.needsUpdate = true;
}
