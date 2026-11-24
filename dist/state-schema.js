// Shared, versioned car-state field order for prediction and dedicated snapshots.
export const CAR_NUMBERS = [
  'boost',
  'boostTime',
  'handbrake',
  'jumpTime',
  'jumpEndTime',
  'airTime',
  'noContact',
  'flipTime',
  'flipRotation',
  'selfRightTime',
  'demoTime',
  'supersonicTime',
  'hitCooldown',
  'extraHitCooldown',
  'recoverTime',
  'score',
  'goals',
  'assists',
  'saves',
  'shots',
  'touches',
  'demos',
  'renderSteer',
  'renderThrottle'
];
export const CAR_FLAGS = [
  'grounded',
  'boosting',
  'drifting',
  'jumpHeld',
  'jumpActive',
  'hasJumped',
  'canDouble',
  'supersonic',
  'flipActive'
];
export const CAR_VECTORS = ['p', 'v', 'omega', 'normal', 'flipAxis'];
