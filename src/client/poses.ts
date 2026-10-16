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

/**
 * A clip through several keyed poses. `keys` are [time as a share of the clip, pose];
 * between keys the motion eases in and out (or runs at constant speed with `linear`,
 * for spins and rolls). `impact` is the share of the clip where a blow connects: the
 * animator lines it up with the moment the hitbox goes live.
 */
export function keyClip(
  name: string,
  keys: [number, Pose][],
  duration: number,
  hipsRest: THREE.Vector3,
  opts: { impact?: number; linear?: boolean } = {},
): THREE.AnimationClip {
  const fps = 30;
  const frames = Math.max(2, Math.round(duration * fps));
  const times: number[] = [];
  const quats = new Map<string, number[]>();
  const hips: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const names = new Set(keys.flatMap(([, p]) => Object.keys(p.bones)));
  for (let i = 0; i <= frames; i++) {
    const u = i / frames;
    times.push(u * duration);
    let j = 0;
    while (j < keys.length - 2 && keys[j + 1]![0] <= u) j++;
    const [ta, pa] = keys[j]!;
    const [tb, pb] = keys[j + 1] ?? keys[j]!;
    let k = tb > ta ? Math.min(1, Math.max(0, (u - ta) / (tb - ta))) : 0;
    if (!opts.linear) k = k * k * (3 - 2 * k);
    const p = mix(pa, pb, k);
    for (const bone of names) {
      const [x, y, z] = p.bones[bone] ?? [0, 0, 0];
      q.setFromEuler(e.set(x, y, z, "XYZ"));
      if (!quats.has(bone)) quats.set(bone, []);
      quats.get(bone)!.push(q.x, q.y, q.z, q.w);
    }
    hips.push(hipsRest.x + p.hips![0], hipsRest.y + p.hips![1], hipsRest.z + p.hips![2]);
  }
  const tracks: THREE.KeyframeTrack[] = [...quats].map(([bone, v]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, v));
  tracks.push(new THREE.VectorKeyframeTrack("hips.position", times, hips));
  const clip = new THREE.AnimationClip(name, duration, tracks);
  if (opts.impact !== undefined) clip.userData.impact = opts.impact;
  return clip;
}

/** A pose built on another, with some bones replaced. */
const over = (base: Pose, bones: Pose["bones"], hips?: Pose["hips"]): Pose => ({ hips: hips ?? base.hips, bones: { ...base.bones, ...bones } });

const still = (p: Pose): Pose => p;

/**
 * The turtle's stances, from its reference sheet:
 * - Idle: low, wide fighting stance, knees bent, one sai forward and one held back;
 * - Blocking: high guard, a sai crossed in front of the face, the other low;
 * - Jump_Idle: the leap, one knee drawn up high, arms flung out with both sais.
 */
/** Wrist bend that lines a sai up with the forearm for a thrust (the grip holds it across the fist). */
let WRIST = -0.25;
export const setWrist = (v: number) => (WRIST = v);

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
  // ---- Lunge run (sheet, second pose): body pitched forward, sais trailing low behind,
  // long low strides. Four keys: left contact, passing, right contact, passing.
  const runBase: Pose = {
    hips: [0, -0.08, 0],
    bones: {
      spine: [0.42, 0, 0],
      chest: [0.12, 0, 0],
      neck: [-0.25, 0, 0],
      head: [-0.3, 0, 0],
      leftUpperArm: [0, 0.75, -1.05],
      leftLowerArm: [0, -0.5, 0],
      rightUpperArm: [0, -0.75, 1.05],
      rightLowerArm: [0, 0.5, 0],
    },
  };
  const stride = (lead: "left" | "right", phase: "contact" | "pass"): Pose => {
    const a = lead;
    const b = lead === "left" ? "right" : "left";
    const swing = lead === "left" ? 1 : -1;
    const legs: Pose["bones"] =
      phase === "contact"
        ? {
            [`${a}UpperLeg`]: [-1.0, 0, 0.06 * swing],
            [`${a}LowerLeg`]: [0.35, 0, 0],
            [`${a}Foot`]: [0.15, 0, 0],
            [`${b}UpperLeg`]: [0.55, 0, -0.06 * swing],
            [`${b}LowerLeg`]: [1.2, 0, 0],
            [`${b}Foot`]: [0.5, 0, 0],
          }
        : {
            [`${a}UpperLeg`]: [-0.25, 0, 0.06 * swing],
            [`${a}LowerLeg`]: [0.45, 0, 0],
            [`${a}Foot`]: [-0.1, 0, 0],
            [`${b}UpperLeg`]: [-0.55, 0, -0.06 * swing],
            [`${b}LowerLeg`]: [1.9, 0, 0],
            [`${b}Foot`]: [0.3, 0, 0],
          };
    // Torso twists against the leading leg; arms counter-swing a little.
    return over(
      runBase,
      {
        ...legs,
        spine: [0.42, 0.18 * swing * (phase === "contact" ? 1 : 0.3), 0],
        leftUpperArm: [0, 0.75 + 0.25 * swing, -1.05],
        rightUpperArm: [0, -0.75 + 0.25 * swing, 1.05],
      },
      phase === "contact" ? [0, -0.11, 0] : [0, -0.03, 0],
    );
  };
  const run = keyClip(
    "Running_A",
    [
      [0, stride("left", "contact")],
      [0.25, stride("left", "pass")],
      [0.5, stride("right", "contact")],
      [0.75, stride("right", "pass")],
      [1, stride("left", "contact")],
    ],
    0.62,
    hipsRest,
  );

  // ---- Sai attacks. All start and end near the fighting stance, so they chain smoothly.
  const legsLunge: Pose["bones"] = {
    leftUpperLeg: [-0.75, -0.1, 0.32],
    leftLowerLeg: [0.95, 0, 0],
    leftFoot: [-0.25, 0, -0.2],
    rightUpperLeg: [0.35, 0.1, -0.35],
    rightLowerLeg: [0.65, 0, 0],
    rightFoot: [-0.4, 0, 0.25],
  };
  const guardArms: Pose["bones"] = {
    leftUpperArm: [0, -0.9, -0.95],
    leftLowerArm: [0, -1.2, 0],
    rightUpperArm: [0, 0.9, 0.95],
    rightLowerArm: [0, 1.3, 0],
  };
  const ready: Pose = { hips: [0, -0.15, 0], bones: { ...stance.bones, ...guardArms } };
  const L = (lu: [number, number, number], ll: [number, number, number]) => ({ leftUpperArm: lu, leftLowerArm: ll });
  const R = (ru: [number, number, number], rl: [number, number, number]) => ({ rightUpperArm: ru, rightLowerArm: rl });

  // Light 1: right-hand straight thrust, driven by the hips.
  const thrustBack = over(ready, { ...legsLunge, ...R([0, -0.35, 1.0], [0, 1.9, 0]), spine: [0.15, 0.35, 0], chest: [0.05, 0.2, 0] }, [0, -0.15, -0.04]);
  const thrust = over(ready, { ...legsLunge, ...R([0, 1.5, 0.12], [0, 0.05, 0]), rightHand: [WRIST, 0, 0], spine: [0.3, -0.4, 0], chest: [0.1, -0.25, 0], head: [-0.2, 0.3, 0] }, [0, -0.18, 0.1]);
  const light0 = keyClip("@light0", [[0, ready], [0.3, thrustBack], [0.42, thrust], [0.62, thrust], [1, ready]], 0.6, hipsRest, { impact: 0.42 });

  // Light 2: left-hand hooking slash, the torso unwinding.
  const hookBack = over(ready, { ...legsLunge, ...L([0, -1.5, -0.15], [0, -1.7, 0]), spine: [0.15, -0.45, 0], chest: [0.05, -0.25, 0] }, [0, -0.15, 0]);
  const hook = over(ready, { ...legsLunge, ...L([0, 0.15, -0.05], [0, -0.25, 0]), spine: [0.22, 0.55, 0], chest: [0.08, 0.3, 0], head: [-0.15, -0.4, 0] }, [0, -0.17, 0.06]);
  const light1 = keyClip("@light1", [[0, ready], [0.3, hookBack], [0.42, hook], [0.6, hook], [1, ready]], 0.6, hipsRest, { impact: 0.42 });

  // Light 3 (finisher): both sais pulled to the hips, then driven forward in a deep lunge.
  const deep: Pose["bones"] = { ...legsLunge, leftUpperLeg: [-1.05, -0.1, 0.25], leftLowerLeg: [1.15, 0, 0], rightUpperLeg: [0.5, 0.1, -0.3], rightLowerLeg: [0.35, 0, 0] };
  const chamber = over(ready, { ...legsLunge, ...L([0, 0.55, -1.2], [0, -1.7, 0]), ...R([0, -0.55, 1.2], [0, 1.7, 0]), spine: [0.05, 0, 0] }, [0, -0.2, -0.05]);
  const doubleThrust = over(ready, { ...deep, ...L([0, -1.4, -0.12], [0, -0.1, 0]), ...R([0, 1.4, 0.12], [0, 0.1, 0]), leftHand: [WRIST, 0, 0], rightHand: [WRIST, 0, 0], spine: [0.38, 0, 0], head: [-0.3, 0, 0] }, [0, -0.27, 0.16]);
  const light2 = keyClip("@light2", [[0, ready], [0.3, chamber], [0.42, doubleThrust], [0.65, doubleThrust], [1, ready]], 0.8, hipsRest, { impact: 0.42 });

  // Heavy: both sais raised overhead, then brought down together.
  const raise = over(ready, { ...L([0, -0.35, 1.35], [0, -0.9, 0]), ...R([0, 0.35, -1.35], [0, 0.9, 0]), spine: [-0.25, 0, 0], chest: [-0.1, 0, 0], head: [0.1, 0, 0] }, [0, -0.06, -0.05]);
  const smash = over(ready, { ...deep, ...L([0, -1.25, -0.7], [0, -0.3, 0]), ...R([0, 1.25, 0.7], [0, 0.3, 0]), spine: [0.6, 0, 0], chest: [0.15, 0, 0], head: [-0.35, 0, 0] }, [0, -0.3, 0.12]);
  const heavy = keyClip("@heavy", [[0, ready], [0.3, raise], [0.42, smash], [0.62, smash], [1, ready]], 1.0, hipsRest, { impact: 0.42 });

  // Aerial: flying knee, both sais scissoring outward.
  const crossed = over(leap, { ...L([0, -1.3, 0.25], [0, -1.3, 0]), ...R([0, 1.3, -0.25], [0, 1.3, 0]), spine: [0.3, 0, 0] });
  const scissor = over(leap, { ...L([0, 0.35, 0.25], [0, -0.1, 0]), ...R([0, -0.35, -0.25], [0, 0.1, 0]), leftUpperLeg: [-1.6, 0, 0.1], rightUpperLeg: [0.7, 0, -0.1], rightLowerLeg: [0.3, 0, 0], spine: [0.05, 0, 0] });
  const aerial = keyClip("@aerial", [[0, leap], [0.3, crossed], [0.42, scissor], [0.7, scissor], [1, leap]], 0.6, hipsRest, { impact: 0.42 });

  // Special, projectile: an overhand throw of the right sai.
  const windThrow = over(ready, { ...legsLunge, ...R([0, -0.7, -1.0], [0, 1.7, 0]), spine: [-0.1, 0.45, 0], chest: [0, 0.2, 0] }, [0, -0.12, -0.05]);
  const release = over(ready, { ...legsLunge, ...R([0, 1.5, 0.45], [0, 0.1, 0]), spine: [0.35, -0.45, 0], chest: [0.1, -0.2, 0] }, [0, -0.17, 0.08]);
  const follow = over(release, { ...R([0, 1.2, 1.0], [0, 0.3, 0]) });
  const throwClip = keyClip("@special:projectile", [[0, ready], [0.3, windThrow], [0.42, release], [0.65, follow], [1, ready]], 0.8, hipsRest, { impact: 0.42 });

  // Special, rush: the shell roll. The turtle curls into its shell and rolls forward.
  const ball: Pose = {
    hips: [0, -0.42, 0],
    bones: {
      spine: [1.0, 0, 0],
      chest: [0.55, 0, 0],
      neck: [0.4, 0, 0],
      head: [0.3, 0, 0],
      leftUpperLeg: [-2.2, 0, 0.1],
      leftLowerLeg: [2.4, 0, 0],
      rightUpperLeg: [-2.2, 0, -0.1],
      rightLowerLeg: [2.4, 0, 0],
      ...L([0, -1.3, -0.9], [0, -1.8, 0]),
      ...R([0, 1.3, 0.9], [0, 1.8, 0]),
    },
  };
  const rolled = (turn: number): Pose => over(ball, { hips: [turn, 0, 0] });
  const curl = keyClip("@special:rush", [[0, ready], [0.42, ball], [1, ball]], 0.5, hipsRest, { impact: 0.42 });
  const roll = keyClip("@rush", [[0, rolled(0)], [0.25, rolled(Math.PI / 2)], [0.5, rolled(Math.PI)], [0.75, rolled(Math.PI * 1.5)], [1, rolled(Math.PI * 2)]], 0.35, hipsRest, { linear: true });

  // Special, area: the fury, a whirlwind of both sais spinning on the spot.
  const spinArms = { ...L([0, 0.1, -0.15], [0, -0.2, 0]), ...R([0, -0.1, 0.15], [0, 0.2, 0]) };
  const spinAt = (turn: number): Pose => over(ready, { ...spinArms, ...legsLunge, hips: [0, turn, 0], spine: [0.2, 0, 0] }, [0, -0.2, 0]);
  const fury = keyClip(
    "@special:area",
    [[0, ready], [0.2, spinAt(0)], [0.42, spinAt(Math.PI)], [0.64, spinAt(Math.PI * 2)], [0.86, spinAt(Math.PI * 3)], [1, spinAt(Math.PI * 4)]],
    0.9,
    hipsRest,
    { impact: 0.42, linear: true },
  );

  return new Map([
    ["Running_A", run],
    ["@light0", light0],
    ["@light1", light1],
    ["@light2", light2],
    ["@heavy", heavy],
    ["@aerial", aerial],
    ["@special:projectile", throwClip],
    ["@special:rush", curl],
    ["@rush", roll],
    ["@special:area", fury],
    ["Idle", poseClip("Idle", stance, stanceBreath, 2.2, hipsRest)],
    ["Blocking", poseClip("Blocking", guard, still({ ...guard, hips: [0, -0.14, 0] }), 1.4, hipsRest)],
    ["Jump_Idle", poseClip("Jump_Idle", leap, leapB, 0.8, hipsRest)],
  ]);
}
