// Run on the authoritative simulation. Clients request Focus; the simulation
// owns the charge, activation, duration and each fighter's time scale.
export const FlowTuning = Object.freeze({
  ComboWindow: 3,
  HitsToCharge: 5,
  FocusDuration: 4,
  SlowScale: 0.35,
});

export function createCombatFlow() {
  return {
    count: 0,
    best: 0,
    window: 0,
    lastSwing: 0,
    charge: 0,
    duration: 4,
    remaining: 0,
  };
}

export function breakHitCombo(flow) {
  flow.count = flow.window = 0;
}

export function recordCleanHit(flow, swingId) {
  if (!Number.isSafeInteger(swingId) || swingId <= flow.lastSwing) return false;
  flow.lastSwing = swingId;
  flow.count = Math.min(999, flow.window > 0 ? flow.count + 1 : 1);
  flow.best = Math.max(flow.best, flow.count);
  flow.window = FlowTuning.ComboWindow;
  // A broad swing earns one award. Hits during Focus cannot refill it.
  if (flow.remaining === 0)
    flow.charge = Math.min(100, flow.charge + 100 / FlowTuning.HitsToCharge);
  return true;
}

export function advanceCombatFlow(
  flow,
  dt,
  { alive = true, request = false, duration = 4 } = {},
) {
  flow.window = Math.max(0, flow.window - dt);
  flow.remaining = Math.max(0, flow.remaining - dt);
  if (flow.window < 1e-7) breakHitCombo(flow);
  if (!alive) {
    breakHitCombo(flow);
    flow.charge = flow.remaining = 0;
    return false;
  }
  if (request === true && flow.charge === 100 && flow.remaining === 0) {
    flow.charge = 0;
    flow.duration = Math.max(4, Math.min(5.5, duration));
    flow.remaining = flow.duration;
    return true;
  }
  return false;
}

export function actorTimeScale(game, actor) {
  // Simultaneous activations counter one another: each active fighter is immune.
  if (actor.flow.remaining > 0) return 1;
  return game.actors.some(
    (other) =>
      other.team !== actor.team && other.alive && other.flow.remaining > 0,
  )
    ? FlowTuning.SlowScale
    : 1;
}

export function validCombatFlow(flow) {
  return Boolean(
    flow &&
      ["count", "best", "lastSwing"].every(
        (key) => Number.isSafeInteger(flow[key]) && flow[key] >= 0,
      ) &&
      flow.count <= 999 &&
      flow.best <= 999 &&
      flow.best >= flow.count &&
      Number.isFinite(flow.duration) &&
      flow.duration >= 4 &&
      flow.duration <= 5.5 &&
      flow.remaining <= flow.duration &&
      [
        ["window", FlowTuning.ComboWindow],
        ["charge", 100],
        ["remaining", 5.5],
      ].every(
        ([key, max]) =>
          Number.isFinite(flow[key]) && flow[key] >= 0 && flow[key] <= max,
      ),
  );
}
