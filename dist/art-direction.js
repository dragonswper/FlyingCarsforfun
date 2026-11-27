import * as T from './vendor/three.module.js';

// One in-place display transform, not a bloom/postprocessing render pass.
// The same exposure and ACES highlight rolloff still protect bright sky/lamps.
const CUSTOM = `vec3 CustomToneMapping( vec3 color ) {
  vec3 mapped = ACESFilmicToneMapping( color );
  float luma = dot( mapped, vec3( 0.2126, 0.7152, 0.0722 ) );
  float peak = max( mapped.r, max( mapped.g, mapped.b ) );
  float vibrance = 1.0 + 0.24 * ( 1.0 - peak );
  return clamp( mix( vec3( luma ), mapped, vibrance ) * 1.025, 0.0, 1.0 );
}`;
export function configureArtDirection(renderer) {
  const chunk = T.ShaderChunk.tonemapping_pars_fragment;
  if (!chunk.includes('float vibrance ='))
    T.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
      /vec3 CustomToneMapping\( vec3 color \) \{ return color; \}/,
      CUSTOM,
    );
  renderer.toneMapping = T.CustomToneMapping;
}

// Scenery gets broad, readable light bands. Vehicle paint, glass, snow shaders
// and the hardwood floor keep their own material/animation behaviour.
export class SceneryArt {
  constructor() {
    this.materials = new Map();
    this.gradient = new T.DataTexture(
      new Uint8Array([65, 128, 196, 255]),
      4,
      1,
      T.RedFormat,
    );
    this.gradient.minFilter = this.gradient.magFilter = T.NearestFilter;
    this.gradient.generateMipmaps = false;
    this.gradient.needsUpdate = true;
  }
  apply(root) {
    root.traverse((object) => {
      if (!object.isMesh || object.userData.keepMaterial) return;
      const convert = (source) => {
        if (
          !source?.isMeshStandardMaterial ||
          source.transparent ||
          source.onBeforeCompile !== T.Material.prototype.onBeforeCompile
        )
          return source;
        if (!this.materials.has(source)) {
          const color = source.color.clone(),
            hsl = {};
          color.getHSL(hsl);
          color.setHSL(
            hsl.h,
            Math.min(0.95, hsl.s * 1.15),
            Math.min(0.85, hsl.l * 1.08),
          );
          const material = new T.MeshToonMaterial({
            color,
            map: source.map,
            gradientMap: this.gradient,
            emissive: source.emissive,
            emissiveMap: source.emissiveMap,
            emissiveIntensity: source.emissiveIntensity,
            normalMap: source.normalMap,
            normalScale: source.normalScale,
            bumpMap: source.bumpMap,
            bumpScale: source.bumpScale,
            aoMap: source.aoMap,
            aoMapIntensity: source.aoMapIntensity,
            lightMap: source.lightMap,
            lightMapIntensity: source.lightMapIntensity,
            side: source.side,
            opacity: source.opacity,
            alphaTest: source.alphaTest,
            vertexColors: source.vertexColors,
            depthWrite: source.depthWrite,
            fog: source.fog,
          });
          material.name = source.name + '_Illustrated';
          material.userData = {...source.userData, illustrated: true};
          this.materials.set(source, material);
        }
        return this.materials.get(source);
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(convert)
        : convert(object.material);
    });
  }
  dispose() {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.gradient.dispose();
  }
}
