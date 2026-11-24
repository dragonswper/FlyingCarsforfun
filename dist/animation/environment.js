// Wind moves leaf vertices in the shader. Static instance transforms stay
// frozen, and trunks/buildings never sway. Each material is cloned once.
const FOLIAGE = new Set(['Pine_Foliage', 'Snow_Caps', 'Broadleaf_Canopies']);
export function bindEnvironmentMotion(root) {
  const time = {value: 0},
    strength = {value: 1},
    materials = [];
  root.traverse((node) => {
    if (!node.isMesh || !FOLIAGE.has(node.name)) return;
    const source = node.material,
      material = source.clone();
    materials.push({node, source, material});
    node.material = material;
    const previous = source.onBeforeCompile;
    material.customProgramCacheKey = () => 'arena-foliage-wind-v1';
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.arenaWindTime = time;
      shader.uniforms.arenaWindStrength = strength;
      shader.vertexShader =
        'uniform float arenaWindTime;\nuniform float arenaWindStrength;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
    float windPhase=position.x*1.7+position.z*2.3;
    #ifdef USE_INSTANCING
     windPhase+=instanceMatrix[3].x*.19+instanceMatrix[3].z*.13;
    #endif
    float windWeight=clamp(position.y+.5,0.,1.);
    transformed.x+=sin(arenaWindTime*1.2+windPhase)*.018*windWeight*arenaWindStrength;
    transformed.z+=sin(arenaWindTime*.8+windPhase)*.01*windWeight*arenaWindStrength;`,
      );
    };
  });
  return {
    update(value, reduced = false) {
      time.value = value;
      strength.value = reduced ? 0 : 1;
    },
    dispose() {
      for (const {node, source, material} of materials) {
        if (node.material === material) node.material = source;
        material.dispose();
      }
    },
    count: materials.length,
  };
}
