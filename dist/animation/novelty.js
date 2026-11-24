import {animateVehicle} from './vehicle.js';

export function animateNoveltyAModel(model, state = {}) {
  if (!model?.noveltyA) return false;
  animateVehicle(model, state);
  if (model.mixer) {
    const dt = Math.min(
      0.1,
      Math.max(0, Number.isFinite(state.dt) ? state.dt : 0),
    );
    const speed = Number.isFinite(state.speed) ? Math.abs(state.speed) : 0;
    const running = state.grounded !== false ? Math.min(2.6, speed / 2.8) : 0;
    model.animationRate +=
      (running - model.animationRate) * (1 - Math.exp(-10 * dt));
    if (speed < 0.05 && model.animationRate < 0.015) {
      model.animationRate = 0;
      model.action.time = 0;
    }
    model.action.timeScale = model.animationRate;
    model.mixer.update(dt);
  }
  return true;
}
