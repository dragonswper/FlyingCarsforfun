const states = new WeakMap();
// Smooth ignition/release without adding trails, lights or per-frame objects.
export function animateBoost(model, active, dt, time, reduced = false) {
  if (!model.flame) return;
  let state = states.get(model);
  if (!state) {
    state = {level: 0};
    states.set(model, state);
  }
  const target = active ? 1 : 0;
  state.level +=
    (target - state.level) * (1 - Math.exp(-(active ? 35 : 18) * dt));
  if (Math.abs(state.level - target) < 0.002) state.level = target;
  model.flame.visible = state.level > 0.005;
  model.flame.scale.z =
    state.level *
    (reduced
      ? 1
      : 1 + Math.sin(time * 71) * 0.055 + Math.sin(time * 103) * 0.025);
  model.flame.scale.x = model.flame.scale.y = 0.8 + state.level * 0.2;
}
