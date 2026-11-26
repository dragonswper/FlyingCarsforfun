// Cosmetic-only choices. No collision, speed, input or network state changes.
export const BOOST_STYLES = Object.freeze({
  classic: {name: 'STANDARD', colors: ['#91e5ff', '#4bbfff']},
  ion: {name: 'ION VIOLET', colors: ['#e5b8ff', '#a669ff']},
  solar: {name: 'SOLAR GOLD', colors: ['#fff1b0', '#ffa83b']},
  mint: {name: 'MINT PLASMA', colors: ['#c4ffe9', '#47e4b2']},
});
export const GOAL_STYLES = Object.freeze({
  classic: 'STANDARD',
  halo: 'AQUA SPARKS',
  nova: 'SOLAR BURST',
});
export const TITLES = Object.freeze({
  driver: {name: 'CIRCUIT DRIVER'},
  striker: {name: 'GOAL GETTER', achievement: 'finisher'},
  keeper: {name: 'SAFE HANDS', achievement: 'keeper'},
  graduate: {name: 'ACADEMY GRADUATE', achievement: 'graduate'},
  champion: {name: 'CUP CHAMPION', achievement: 'cup'},
});
export const BANNERS = Object.freeze({
  slate: {name: 'MIDNIGHT', color: '#24465e'},
  coast: {name: 'COASTLINE', color: '#216965'},
  sunset: {name: 'SUNSET', color: '#754b42'},
});
export function clubStyle(value = {}) {
  return {
    boost: Object.hasOwn(BOOST_STYLES, value?.boost) ? value.boost : 'classic',
    goal: Object.hasOwn(GOAL_STYLES, value?.goal) ? value.goal : 'classic',
    banner: Object.hasOwn(BANNERS, value?.banner) ? value.banner : 'slate',
    title: Object.hasOwn(TITLES, value?.title) ? value.title : 'driver',
  };
}
export class ClubEffects {
  constructor(view) {
    this.view = view;
    this.models = new WeakMap();
  }
  apply(localId, style) {
    const model = this.view.cars.get(localId);
    if (!model?.flame || this.models.get(model) === style.boost) return;
    let index = 0;
    model.flame.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material?.color) return;
      const mat = mesh.material;
      mesh.material.color.set(BOOST_STYLES[style.boost].colors[index++ % 2]);
    });
    this.models.set(model, style.boost);
  }
  goal(event, sim, localId, style) {
    const player = sim.cars.find((c) => c.id === localId);
    if (event.scorer !== localId || !player) return;
    // Existing 128-particle pool provides the full effect; no new emitters,
    // lights or unbounded meshes. Reduced motion keeps the standard burst.
    if (this.view.animations?.reduced || style.goal === 'classic') return;
    const p = sim.ball.p.toArray();
    this.view.burst(
      p,
      style.goal === 'halo' ? '#89f6ef' : '#ffe4a3',
      style.goal === 'halo' ? 28 : 48,
    );
  }
}
