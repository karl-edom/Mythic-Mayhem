// Hand-keyed poses for procedural models, built from a reference sheet: each pose is a
// set of bone rotations (Euler angles, radians, relative to the T-pose) and a hips
// height. A clip loops between two close variants of a pose (breathing, weight shift).
//
// Conventions (T-pose, facing +Z, left = +X), for a positive angle:
//   legs  x: thigh / shin swings backward (so a thigh lifts forward with x < 0, a knee bends with x > 0)
//         z: left leg opens outward (right leg: z < 0)
//   spine x: leans forward
//   left arm  z: raises (down is z < 0);  y: swings backward (forward is y < 0)
//   right arm z: lowers (down is z > 0);  y: swings forward

import * as THREE from "three";

export type Pose = { bones: Record<string, [number, number, number]>; hips?: [number, number, number] };

/** Interpolates two poses (bones missing from one keep their rest rotation there). */
function mix(a: Pose, b: Pose, k: number): Pose {
  const bones: Pose["bones"] = {};
  for (const name of new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])) {
    const pa = a.bones[name] ?? [0, 0, 0];
    const pb = b.bones[name] ?? [0, 0, 0];
    bones[name] = [pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, pa[2] + (pb[2] - pa[2]) * k];
  }
  const ha = a.hips ?? [0, 0, 0];
  const hb = b.hips ?? [0, 0, 0];
  return { bones, hips: [ha[0] + (hb[0] - ha[0]) * k, ha[1] + (hb[1] - ha[1]) * k, ha[2] + (hb[2] - ha[2]) * k] };
}

/**
 * A looping clip that eases from pose `a` to `b` and back over `period` seconds.
 * `hipsRest` is the hips' rest position; poses give an offset from it.
 */
export function poseClip(name: string, a: Pose, b: Pose, period: number, hipsRest: THREE.Vector3): THREE.AnimationClip {
  const frames = 16;
  const times: number[] = [];
  const quats = new Map<string, number[]>();
  const hips: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * period;
    times.push(t);
    const k = 0.5 - 0.5 * Math.cos((i / frames) * Math.PI * 2);
    const p = mix(a, b, k);
    for (const [bone, [x, y, z]] of Object.entries(p.bones)) {
      q.setFromEuler(e.set(x, y, z, "XYZ"));
      if (!quats.has(bone)) quats.set(bone, []);
      quats.get(bone)!.push(q.x, q.y, q.z, q.w);
    }
    hips.push(hipsRest.x + p.hips![0], hipsRest.y + p.hips![1], hipsRest.z + p.hips![2]);
  }
  const tracks: THREE.KeyframeTrack[] = [...quats].map(([bone, v]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, v));
  tracks.push(new THREE.VectorKeyframeTrack("hips.position", times, hips));
  return new THREE.AnimationClip(name, period, tracks);
}

const still = (p: Pose): Pose => p;

/**
 * The turtle's stances, from its reference sheet:
 * - Idle: low, wide fighting stance, knees bent, one sai forward and one held back;
 * - Blocking: high guard, a sai crossed in front of the face, the other low;
 * - Jump_Idle: the leap, one knee drawn up high, arms flung out with both sais.
 */
export function turtlePoses(hipsRest: THREE.Vector3): Map<string, THREE.AnimationClip> {
  const stance: Pose = {
    hips: [0, -0.17, 0],
    bones: {
      spine: [0.22, 0.25, 0],
      chest: [0.12, 0.15, 0],
      neck: [-0.12, -0.15, 0],
      head: [-0.15, -0.2, 0],
      leftUpperLeg: [-0.75, -0.2, 0.42],
      leftLowerLeg: [1.15, 0, 0],
      leftFoot: [-0.45, 0, -0.3],
      rightUpperLeg: [-0.15, 0.2, -0.5],
      rightLowerLeg: [0.95, 0, 0],
      rightFoot: [-0.65, 0, 0.35],
      // Lead arm (left) forward, elbow bent, sai pointing at the foe.
      leftUpperArm: [0, -0.9, -0.95],
      leftLowerArm: [0, -1.2, 0],
      leftHand: [0, 0, 0.2],
      // Rear arm (right) low and back, sai along the forearm.
      rightUpperArm: [0, 0.25, 1.1],
      rightLowerArm: [0, 1.5, 0],
      rightHand: [0.3, 0, 0],
    },
  };
  const stanceBreath: Pose = {
    hips: [0, -0.19, 0],
    bones: {
      ...stance.bones,
      chest: [0.16, 0.15, 0],
      leftUpperArm: [0, -0.85, -0.9],
      rightUpperArm: [0, 0.3, 1.05],
    },
  };
  const guard: Pose = {
    hips: [0, -0.13, 0],
    bones: {
      spine: [0.1, -0.2, 0],
      chest: [0.05, -0.1, 0],
      head: [-0.1, 0.25, 0],
      leftUpperLeg: [-0.55, 0, 0.5],
      leftLowerLeg: [0.8, 0, 0],
      leftFoot: [-0.25, 0, -0.4],
      rightUpperLeg: [0.25, 0, -0.45],
      rightLowerLeg: [0.6, 0, 0],
      rightFoot: [-0.6, 0, 0.4],
      // Right sai raised in front of the face, left one low and forward.
      rightUpperArm: [0, 1.2, 0.25],
      rightLowerArm: [0, 1.6, -0.3],
      rightHand: [0, 0, 0.4],
      leftUpperArm: [0, -0.6, -1.1],
      leftLowerArm: [0, -0.9, 0],
    },
  };
  const leap: Pose = {
    hips: [0, 0, 0],
    bones: {
      spine: [0.15, 0, 0],
      head: [-0.1, 0, 0],
      leftUpperLeg: [-1.5, 0, 0.15],
      leftLowerLeg: [1.9, 0, 0],
      leftFoot: [0.3, 0, 0],
      rightUpperLeg: [0.35, 0, -0.1],
      rightLowerLeg: [0.9, 0, 0],
      rightFoot: [0.5, 0, 0],
      leftUpperArm: [0, -0.3, 0.35],
      leftLowerArm: [0, -0.6, 0],
      rightUpperArm: [0, 0.5, -0.1],
      rightLowerArm: [0, 0.9, 0],
    },
  };
  const leapB: Pose = { ...leap, bones: { ...leap.bones, leftUpperLeg: [-1.4, 0, 0.15], rightUpperLeg: [0.45, 0, -0.1] } };
  return new Map([
    ["Idle", poseClip("Idle", stance, stanceBreath, 2.2, hipsRest)],
    ["Blocking", poseClip("Blocking", guard, still({ ...guard, hips: [0, -0.14, 0] }), 1.4, hipsRest)],
    ["Jump_Idle", poseClip("Jump_Idle", leap, leapB, 0.8, hipsRest)],
  ]);
}
