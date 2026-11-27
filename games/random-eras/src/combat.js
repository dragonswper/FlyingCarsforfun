export const CombatTuning = Object.freeze({
  MinFlickVelocity: 780, // Relative mouse units per second.
  MinFlickDistance: 180, // Relative mouse units in a deliberate swipe.
  FlickWindow: 0.135, // Seconds of recent motion that can contribute to a swipe.
  InputCooldown: 0.10, // Seconds after recovery before another windup.
  ParryWindow: 0.16,
  GuardDrain: 8,
  GuardBreak: 0.58,
  BufferWindow: 0.30, // Fraction at the end of the active swing.
});

export const Cuts = Object.freeze({
  UP: Object.freeze({ damage: 1, guardCost: 13, stagger: 0.15, cone: 0.52 }),
  DOWN: Object.freeze({ damage: 1, guardCost: 23, stagger: 0.08, cone: 0.54 }),
  LEFT: Object.freeze({ damage: 0.92, guardCost: 17, stagger: 0, cone: 0.24 }),
  RIGHT: Object.freeze({ damage: 0.92, guardCost: 17, stagger: 0, cone: 0.24 }),
});

export const AttackPhase = Object.freeze({
  IDLE: 'IDLE',
  WINDUP: 'WINDUP',
  ACTIVE_SWING: 'ACTIVE_SWING',
  RECOVERY: 'RECOVERY',
  COOLDOWN: 'COOLDOWN',
});

const { IDLE, WINDUP, ACTIVE_SWING, RECOVERY, COOLDOWN } = AttackPhase;
const NEXT_PHASE = { [WINDUP]: ACTIVE_SWING, [ACTIVE_SWING]: RECOVERY, [RECOVERY]: COOLDOWN, [COOLDOWN]: IDLE };
const WEAPON_TIMING = { [WINDUP]: 'windup', [ACTIVE_SWING]: 'swing', [RECOVERY]: 'recovery' };
const HIT_PROGRESS = 0.35;
const EPSILON = 1e-9;

export function makeFlick(dx, dy, velocity) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || !length || !Number.isFinite(velocity)) return null;

  // Positive Y means up. The half-open sectors give exact diagonals one owner.
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  let direction = 'LEFT';
  if (angle >= -45 && angle < 45) direction = 'RIGHT';
  else if (angle >= 45 && angle < 135) direction = 'UP';
  else if (angle >= -135 && angle < -45) direction = 'DOWN';
  return { x: dx / length, y: dy / length, angle, direction, velocity };
}

export function createCombatState() {
  return { phase: IDLE, elapsed: 0, gesture: null, buffered: null, swingId: 0, hit: false };
}

export function isSwinging(combat) {
  return combat.phase !== IDLE && combat.phase !== COOLDOWN;
}

function inBufferWindow(progress, window) {
  return progress + EPSILON >= 1 - window && progress < 1;
}

export function comboProgress(combat, weapon, lead = 0) {
  if (combat.phase !== ACTIVE_SWING || combat.buffered) return null;
  const progress = (combat.elapsed + lead) / weapon.swing;
  return inBufferWindow(progress, combat.bufferWindow ?? CombatTuning.BufferWindow) ? progress : null;
}

function canBuffer(combat, weapon, gesture, allowLateCombo) {
  if (combat.buffered || (gesture.combo && gesture.combo.swingId !== combat.swingId)) return false;
  if (comboProgress(combat, weapon) !== null) return true;

  // A guest's observed window can arrive after the host has entered recovery.
  // A matching swing ID prevents delayed packets from queuing on a later swing.
  return allowLateCombo && gesture.combo && inBufferWindow(gesture.combo.progress, CombatTuning.BufferWindow)
    && (combat.phase === RECOVERY || combat.phase === COOLDOWN);
}

function startSwing(combat, gesture) {
  combat.phase = WINDUP;
  combat.elapsed = 0;
  combat.gesture = gesture;
  combat.swingId++;
  combat.hit = false;
}

export function advanceCombat(combat, weapon, dt, {
  gesture = null, canAttack = true, cancelBuffer = false, allowLateCombo = false,
} = {}) {
  let started = false;
  let strike = null;
  if (cancelBuffer) combat.buffered = null;
  if (gesture?.velocity >= CombatTuning.MinFlickVelocity && !cancelBuffer) {
    if (combat.phase === IDLE && canAttack && !gesture.combo) {
      startSwing(combat, gesture);
      started = true;
    } else if (canBuffer(combat, weapon, gesture, allowLateCombo)) {
      combat.buffered = gesture;
    }
  }

  // Carry unused time into the next phase so timing is independent of frame rate.
  let remaining = dt;
  while (remaining > EPSILON && combat.phase !== IDLE) {
    const phase = combat.phase;
    const duration = phase === COOLDOWN ? CombatTuning.InputCooldown : weapon[WEAPON_TIMING[phase]];
    const advance = Math.min(remaining, duration - combat.elapsed);
    combat.elapsed += advance;
    remaining -= advance;

    if (phase === ACTIVE_SWING && !combat.hit && combat.elapsed + EPSILON >= duration * HIT_PROGRESS) {
      combat.hit = true;
      strike = combat.gesture;
    }
    if (combat.elapsed + EPSILON < duration) break;

    combat.phase = NEXT_PHASE[phase];
    combat.elapsed = 0;
    if (combat.phase === IDLE) {
      const followUp = combat.buffered;
      combat.buffered = null;
      combat.gesture = null;
      if (followUp && canAttack) {
        startSwing(combat, followUp);
        started = true;
      }
    }
  }
  return { started, strike };
}
