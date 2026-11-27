import { Quaternion, Vector3 } from 'three';
import { loadModel } from './assets.js';

const gripNames = { negative: 'sword-grip', positive: 'shield-grip' };
const gripOffset = new Vector3();
const wrist = new Vector3();
const axis = new Vector3();
const bend = new Vector3();
const elbow = new Vector3();
const lower = new Vector3();
const handRotation = new Quaternion();
const lowerRotation = new Quaternion();
let knightRequest;

function armNodes(model, side) {
  const upper = model.getObjectByName(`upper-${side}`);
  const forearm = model.getObjectByName(`forearm-${side}`);
  const hand = model.getObjectByName(`hand-${side}`);
  const grip = model.getObjectByName(gripNames[side]);
  if (!upper || forearm?.parent !== upper || hand?.parent !== forearm || grip?.parent !== hand
    || !forearm.position.lengthSq() || !hand.position.lengthSq()) {
    throw new Error(`Invalid knight arm hierarchy for ${side}`);
  }
  return { upper, forearm, hand, grip };
}

export function loadKnight() {
  knightRequest ??= loadModel('knight', 4)
    .then(({ scene }) => {
      const required = ['body', 'helm', 'cape', 'sheath', 'leg-negative', 'leg-positive', 'sword', 'dagger', 'shield'];
      if (required.some((name) => !scene.getObjectByName(name))) throw new Error('Incomplete knight model');
      for (const side of Object.keys(gripNames)) armNodes(scene, side);
      return scene;
    })
    .catch((error) => {
      knightRequest = undefined;
      throw error;
    });
  return knightRequest;
}

export function bindKnightArm(model, side) {
  const { upper, forearm, hand, grip } = armNodes(model, side);
  const upperLength = forearm.position.length();
  const lowerLength = hand.position.length();
  return {
    upper, forearm, hand, grip, upperLength, lowerLength,
    upperAxis: forearm.position.clone().normalize(),
    lowerAxis: hand.position.clone().normalize(),
    inverseGrip: grip.quaternion.clone().invert(),
    elbowPole: new Vector3(side === 'negative' ? -0.78 : 0.78, -0.92, -0.3),
  };
}

function reachWrist(arm, target, rotation) {
  handRotation.copy(rotation).multiply(arm.inverseGrip);
  gripOffset.copy(arm.grip.position).applyQuaternion(handRotation);
  wrist.subVectors(target, arm.upper.position).sub(gripOffset);
  // At a collapsed target use the bind direction to select a valid fold.
  if (wrist.lengthSq() < 1e-8) wrist.copy(arm.upperAxis);
  return wrist.clampLength(Math.abs(arm.upperLength - arm.lowerLength) + 0.045,
    arm.upperLength + arm.lowerLength - 0.008);
}

export function limitKnightGrip(arm, target, rotation) {
  return target.copy(reachWrist(arm, target, rotation)).add(arm.upper.position).add(gripOffset);
}

export function poseKnightGrip(arm, target, rotation) {
  const reach = reachWrist(arm, target, rotation);
  const distance = reach.length();
  axis.copy(reach).divideScalar(distance);

  // The elbow sits at the intersection of two spheres around shoulder and wrist.
  const along = (distance ** 2 + arm.upperLength ** 2 - arm.lowerLength ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, arm.upperLength ** 2 - along ** 2));
  bend.copy(arm.elbowPole).addScaledVector(axis, -arm.elbowPole.dot(axis));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(axis, -axis.z);
  elbow.copy(axis).multiplyScalar(along).addScaledVector(bend.normalize(), height);
  lower.subVectors(reach, elbow).normalize();

  arm.upper.quaternion.setFromUnitVectors(arm.upperAxis, elbow.normalize());
  lowerRotation.setFromUnitVectors(arm.lowerAxis, lower);
  arm.forearm.quaternion.copy(arm.upper.quaternion).invert().multiply(lowerRotation);
  arm.hand.quaternion.copy(lowerRotation).invert().multiply(handRotation);
}
