// The unarmed style (martial artists, brawlers): a high guard, fists and kicks. Bodies
// are keyed by angle like the other styles; the arms are solved: a pose says where each
// fist is (from the hips, in the hips' frame) and the two-bone solver places the arm,
// the wrist straight behind the knuckles.

import * as THREE from "three";
import { keyClip, mix, over, poseClip, reactionClips, type Key, type Pose } from "./poses.ts";
import { bodies, fk, solveArm, useBones, type BoneTable, type V } from "./swordPoses.ts";
import { SWORDSMAN_BONES } from "./swordsman.ts";

export interface Fists {
  /** Right and left fist, from the hips (hips' frame), metres; null leaves the arm as the body has it. */
  r: V | null;
  l: V | null;
  /** Elbow directions (rig space). */
  rPole?: V;
  lPole?: V;
}

/** The body pose with its arms solved to put the fists where `f` says. */
export function fists(body: Pose, f: Fists): Pose {
  const hips = fk(body, "hips");
  const p: Pose = { hips: body.hips, bones: { ...body.bones }, q: { ...(body.q ?? {}) } };
  for (const [side, at, pole, def] of [[-1, f.r, f.rPole, [-0.55, -1, -0.25]], [1, f.l, f.lPole, [0.55, -1, -0.25]]] as const) {
    if (!at) continue;
    const s = side > 0 ? "left" : "right";
    for (const b of ["UpperArm", "LowerArm", "Hand"]) delete p.bones[`${s}${b}`];
    const target = new THREE.Vector3(...at).applyQuaternion(hips.q).add(hips.pos);
    Object.assign(p.q!, solveArm(body, side, target, null, new THREE.Vector3(...(pole ?? def))));
  }
  return p;
}

/** The unarmed style on a humanoid skeleton (the code-built human's by default). */
export function fistPoses(hipsRest: THREE.Vector3, bones: BoneTable = SWORDSMAN_BONES): Map<string, THREE.AnimationClip> {
  useBones(bones);
  const { low, lunge, tucked, turn } = bodies();
  // A lighter, more upright stance than the swordsman's: on the balls of the feet.
  const base = over(low, { spine: [0.12, 0.25, 0], chest: [0.04, 0.12, 0], head: [-0.1, -0.35, 0] }, [0, -0.13, 0]);
  /** The guard: lead (left) fist forward at chin height, rear fist by the jaw. */
  const guardFists: Fists = { r: [-0.1, 0.52, 0.22], l: [0.1, 0.55, 0.36] };
  const stance = fists(base, guardFists);
  const stanceB = fists({ ...base, hips: [0, -0.15, 0] }, { r: [-0.1, 0.5, 0.22], l: [0.1, 0.53, 0.35] });
  // Block: both forearms up in front of the face.
  const guard = fists(over(base, { spine: [0.22, 0, 0], head: [0.05, 0, 0] }, [0, -0.18, 0]), { r: [-0.07, 0.62, 0.3], l: [0.07, 0.62, 0.3], rPole: [-0.3, -1, 0.5], lPole: [0.3, -1, 0.5] });
  const air = fists(tucked, { r: [-0.14, 0.45, 0.2], l: [0.14, 0.48, 0.28] });
  const airB = fists(over(tucked, { leftUpperLeg: [-1.3, 0, 0.2], rightUpperLeg: [-0.4, 0, -0.15] }), { r: [-0.14, 0.46, 0.19], l: [0.14, 0.49, 0.27] });

  // ---- Run: fists pumping by the ribs, pitched forward.
  const runBody = (lead: 1 | -1, contact: boolean): Pose => {
    const [a, b] = lead > 0 ? ["left", "right"] : ["right", "left"];
    const legs: Pose["bones"] = contact
      ? { [`${a}UpperLeg`]: [-1.05, 0, 0], [`${a}LowerLeg`]: [0.4, 0, 0], [`${a}Foot`]: [0.15, 0, 0], [`${b}UpperLeg`]: [0.55, 0, 0], [`${b}LowerLeg`]: [1.25, 0, 0], [`${b}Foot`]: [0.5, 0, 0] }
      : { [`${a}UpperLeg`]: [-0.25, 0, 0], [`${a}LowerLeg`]: [0.5, 0, 0], [`${a}Foot`]: [-0.1, 0, 0], [`${b}UpperLeg`]: [-0.6, 0, 0], [`${b}LowerLeg`]: [1.9, 0, 0], [`${b}Foot`]: [0.3, 0, 0] };
    const body: Pose = { hips: contact ? [0, -0.1, 0] : [0, -0.03, 0], bones: { ...legs, spine: [0.4, 0.12 * lead, 0], chest: [0.1, 0, 0], head: [-0.3, 0, 0] } };
    // The arm opposite the lead leg swings forward.
    const k = contact ? 1 : 0.3;
    return fists(body, { r: [-0.2, 0.35, 0.05 + 0.22 * k * lead], l: [0.2, 0.35, 0.05 - 0.22 * k * lead], rPole: [-0.3, -0.4, -1], lPole: [0.3, -0.4, -1] });
  };
  const run = keyClip("Running_A", [[0, runBody(1, true)], [0.25, runBody(1, false)], [0.5, runBody(-1, true)], [0.75, runBody(-1, false)], [1, runBody(1, true)]], 0.6, hipsRest, { loop: true });

  const blow = (coil: Pose, hit: Pose, rest: Pose = stance, reach = 1.1): Key[] => [
    [0, rest],
    [0.3, coil],
    [0.42, hit, "in"],
    [0.54, mix(coil, hit, reach), "out"],
    [0.72, mix(hit, rest, 0.3)],
    [1, rest],
  ];
  // Light 1: the jab, the lead fist straight out.
  const jabCoil = fists(turn(base, 0.15), { r: [-0.1, 0.52, 0.2], l: [0.1, 0.5, 0.26] });
  const jab = fists(turn(lunge, 0.25), { r: [-0.1, 0.52, 0.2], l: [0.05, 0.5, 0.72], lPole: [0.6, -0.6, -0.3] });
  const light0 = keyClip("@light0", blow(jabCoil, jab), 0.5, hipsRest, { impact: 0.42 });
  // Light 2: the cross, the rear fist, the hips turning through.
  const crossCoil = fists(turn(base, 0.45), { r: [-0.16, 0.48, 0.12], l: [0.12, 0.52, 0.3] });
  const cross = fists(turn(lunge, -0.4), { r: [-0.02, 0.52, 0.72], l: [0.12, 0.5, 0.16], rPole: [-0.6, -0.6, -0.3] });
  const light1 = keyClip("@light1", blow(crossCoil, cross), 0.5, hipsRest, { impact: 0.42 });
  // Light 3 (finisher): a high kick, the knee chambered then the leg snapped out, the
  // trunk leaning back against it, the arms flung for balance.
  const chamber = fists(over(base, { rightUpperLeg: [-1.7, 0, -0.1], rightLowerLeg: [2.1, 0, 0], leftUpperLeg: [-0.15, 0, 0.1], leftLowerLeg: [0.35, 0, 0], spine: [0.1, 0.15, 0], head: [-0.05, -0.2, 0] }, [0, -0.1, 0]), { r: [-0.2, 0.45, 0.1], l: [0.15, 0.55, 0.25] });
  const kick = fists(
    over(base, { rightUpperLeg: [-1.85, 0, -0.1], rightLowerLeg: [0.1, 0, 0], rightFoot: [0.5, 0, 0], leftUpperLeg: [-0.05, 0, 0.1], leftLowerLeg: [0.2, 0, 0], spine: [-0.3, 0.1, 0], chest: [-0.05, 0, 0], head: [0.2, -0.1, 0] }, [0, -0.06, -0.04]),
    { r: [-0.4, 0.25, -0.15], l: [0.35, 0.35, 0.05], rPole: [-1, 0, -0.3], lPole: [1, 0, -0.3] },
  );
  const light2 = keyClip("@light2", blow(chamber, kick, stance, 1.06), 0.75, hipsRest, { impact: 0.42 });
  // Heavy: the fist drawn back to the hip (held while charging), then a full straight punch.
  const draw = fists(turn(over(base, { spine: [0.2, 0, 0] }, [0, -0.2, -0.04]), 0.55), { r: [-0.24, 0.18, -0.1], l: [0.18, 0.45, 0.35], rPole: [-0.3, -0.3, -1] });
  const drawDeep = fists(turn(over(base, { spine: [0.25, 0, 0] }, [0, -0.24, -0.06]), 0.65), { r: [-0.26, 0.16, -0.14], l: [0.2, 0.45, 0.38], rPole: [-0.3, -0.3, -1] });
  const deep: Pose = over(lunge, { leftUpperLeg: [-1.15, -0.1, 0.3], leftLowerLeg: [1.25, 0, 0], rightUpperLeg: [0.6, 0.1, -0.3], rightLowerLeg: [0.3, 0, 0], spine: [0.4, 0, 0], head: [-0.3, 0, 0] }, [0, -0.28, 0.14]);
  const smash = fists(turn(deep, -0.45), { r: [0.0, 0.45, 0.8], l: [0.2, 0.3, 0.05], rPole: [-0.6, -0.6, -0.3] });
  const heavy = keyClip(
    "@heavy",
    [[0, stance], [0.24, draw], [0.32, drawDeep], [0.42, smash, "in"], [0.52, mix(drawDeep, smash, 1.07), "out"], [0.72, mix(smash, stance, 0.3)], [1, stance]],
    1.0,
    hipsRest,
    { impact: 0.42 },
  );
  // Aerial: a flying kick, one leg straight out, the other tucked.
  const airCoil = fists(over(tucked, { rightUpperLeg: [-1.6, 0, -0.1], rightLowerLeg: [2.2, 0, 0] }), { r: [-0.18, 0.4, 0.15], l: [0.18, 0.45, 0.2] });
  const airKick = fists(over(tucked, { spine: [-0.15, 0, 0], rightUpperLeg: [-1.45, 0, -0.1], rightLowerLeg: [0.1, 0, 0], rightFoot: [0.6, 0, 0], leftUpperLeg: [-0.9, 0, 0.2], leftLowerLeg: [1.9, 0, 0] }), { r: [-0.3, 0.38, -0.05], l: [0.3, 0.42, 0.0] });
  const aerial = keyClip("@aerial", blow(airCoil, airKick, air, 1.08), 0.6, hipsRest, { impact: 0.42 });

  // ---- Beam (projectile): the hands cupped together at the hip, gathering, then pushed
  // out at the foe, palms open (the energy leaves from between them).
  const cupBody = turn(over(low, { spine: [0.2, 0, 0], head: [-0.15, 0, 0] }, [0, -0.24, -0.02]), 0.7);
  const cup = fists(cupBody, { r: [-0.24, 0.2, -0.04], l: [-0.18, 0.24, 0.0], rPole: [-0.3, -0.3, -1], lPole: [0.3, -0.6, -0.6] });
  const cupB = fists(over(cupBody, {}, [0, -0.27, -0.03]), { r: [-0.25, 0.19, -0.05], l: [-0.19, 0.23, -0.01], rPole: [-0.3, -0.3, -1], lPole: [0.3, -0.6, -0.6] });
  const pushBody = turn(over(lunge, { spine: [0.15, 0, 0], head: [-0.2, 0, 0] }, [0, -0.26, 0.06]), -0.1);
  const push = fists(pushBody, { r: [-0.05, 0.45, 0.68], l: [0.05, 0.45, 0.68], rPole: [-0.8, -0.6, 0], lPole: [0.8, -0.6, 0] });
  const beam = keyClip("@special:projectile", [[0, stance], [0.18, cup], [0.36, cupB], [0.42, push, "in"], [0.8, push], [1, stance]], 0.9, hipsRest, { impact: 0.42 });

  // ---- Dash punch (rush): the fist drawn back, then flying at the foe, fist first.
  const enterRush = keyClip("@special:rush", [[0, stance], [0.42, drawDeep, "in"], [1, drawDeep]], 0.5, hipsRest, { impact: 0.42 });
  const flying = (k: number): Pose =>
    fists(
      { hips: [0, -0.15, 0], bones: { spine: [0.75, 0, 0], chest: [0.15, 0, 0], head: [-0.6, 0, 0], leftUpperLeg: [0.45 + 0.1 * k, 0, 0.1], leftLowerLeg: [0.9 - 0.3 * k, 0, 0], rightUpperLeg: [0.3 - 0.1 * k, 0, -0.1], rightLowerLeg: [0.6 + 0.3 * k, 0, 0] } },
      { r: [-0.02, 0.58, 0.62], l: [0.2, 0.32, 0.0], rPole: [-0.6, -0.6, -0.3], lPole: [0.3, -0.3, -1] },
    );
  const rush = keyClip("@rush", [[0, flying(0)], [0.5, flying(1)], [1, flying(0)]], 0.3, hipsRest, { loop: true });

  // ---- Hammer from the sky (leap): a crouch, both fists raised high, down onto the ground.
  const crouch = fists(over(low, { spine: [0.5, 0, 0], head: [-0.35, 0, 0], leftUpperLeg: [-1.2, -0.1, 0.45], leftLowerLeg: [1.8, 0, 0], rightUpperLeg: [-0.7, 0.1, -0.45], rightLowerLeg: [1.6, 0, 0] }, [0, -0.36, 0]), { r: [-0.22, 0.15, -0.12], l: [0.22, 0.15, -0.12], rPole: [-0.3, 0, -1], lPole: [0.3, 0, -1] });
  const takeoff = keyClip("@special:leap", [[0, stance], [0.42, crouch], [1, crouch]], 0.5, hipsRest, { impact: 0.42 });
  const rising = fists({ hips: [0, 0, 0], bones: { spine: [-0.1, 0, 0], leftUpperLeg: [-0.2, 0, 0.1], leftLowerLeg: [0.3, 0, 0], leftFoot: [0.6, 0, 0], rightUpperLeg: [0.1, 0, -0.1], rightLowerLeg: [0.4, 0, 0], rightFoot: [0.6, 0, 0] } }, { r: [-0.05, 0.95, 0.1], l: [0.05, 0.95, 0.1] });
  const peak = fists(over(tucked, { spine: [-0.15, 0, 0], head: [0.05, 0, 0] }), { r: [-0.04, 0.9, -0.05], l: [0.04, 0.9, -0.05], rPole: [-0.6, 0, 1], lPole: [0.6, 0, 1] });
  const dive = fists(over(tucked, { spine: [0.5, 0, 0], head: [-0.4, 0, 0] }), { r: [-0.04, 0.85, 0.2], l: [0.04, 0.85, 0.2], rPole: [-0.6, 0, 1], lPole: [0.6, 0, 1] });
  const leapClip = keyClip("@leap", [[0, crouch], [0.25, rising, "out"], [0.55, peak], [0.85, dive], [1, dive]], 1.0, hipsRest);
  const kneel: Pose = over(deep, { rightUpperLeg: [0.2, 0.1, -0.25], rightLowerLeg: [1.7, 0, 0], rightFoot: [0.5, 0, 0], spine: [0.75, 0, 0] }, [0, -0.45, 0.12]);
  const pound = fists(kneel, { r: [-0.02, -0.25, 0.48], l: [0.25, 0.2, 0.15], rPole: [-0.8, 0.2, -0.3] });
  const land = keyClip("@leap:land", [[0, dive], [0.15, pound, "in"], [0.5, pound], [1, stance]], 0.8, hipsRest, { impact: 0.15 });

  // ---- Power burst (area): fists clenched low and wide, chest out, a shout to the sky.
  const brace = fists(over(low, { spine: [0.35, 0, 0], head: [-0.25, 0, 0] }, [0, -0.25, 0]), { r: [-0.08, 0.32, 0.18], l: [0.08, 0.32, 0.18], rPole: [-1, 0, 0], lPole: [1, 0, 0] });
  const shout = fists(over(low, { spine: [-0.25, 0, 0], chest: [-0.15, 0, 0], neck: [0.15, 0, 0], head: [0.35, 0, 0] }, [0, -0.2, 0]), { r: [-0.42, 0.05, 0.0], l: [0.42, 0.05, 0.0], rPole: [-0.4, 0, -1], lPole: [0.4, 0, -1] });
  const burst = keyClip("@special:area", [[0, stance], [0.25, brace], [0.42, shout, "in"], [0.8, shout], [1, stance]], 0.9, hipsRest, { impact: 0.42 });

  // ---- Substitution (counter): a still, watchful guard; caught, the fighter is already
  // behind the attacker, and a spinning back fist.
  const watchBody = over(base, { spine: [0.2, 0, 0], head: [-0.2, 0, 0] }, [0, -0.2, 0]);
  const watch = fists(watchBody, { r: [-0.05, 0.5, 0.3], l: [0.05, 0.5, 0.3], rPole: [-1, -0.5, 0], lPole: [1, -0.5, 0] });
  const watchB = fists(over(watchBody, {}, [0, -0.22, 0]), { r: [-0.05, 0.49, 0.3], l: [0.05, 0.49, 0.3], rPole: [-1, -0.5, 0], lPole: [1, -0.5, 0] });
  const enterWatch = keyClip("@special:counter", [[0, stance], [0.42, watch], [1, watch]], 0.4, hipsRest, { impact: 0.42 });
  const spinAt = (yaw: number, k: number): Pose =>
    fists(over(lunge, { hips: [0, yaw, 0], spine: [0.2, 0, 0] }, [0, -0.2, 0]), { r: [-0.3 - 0.3 * k, 0.5, 0.2 + 0.35 * k], l: [0.15, 0.5, 0.25], rPole: [-0.3, -1, 0.3] });
  const counterStrike = keyClip(
    "@counter:strike",
    [[0, spinAt(Math.PI * 1.4, 0)], [0.3, spinAt(Math.PI * 0.4, 0.5), "in"], [0.45, spinAt(0, 1), "out"], [0.65, spinAt(-0.15, 1)], [1, stance]],
    0.7,
    hipsRest,
    { impact: 0 },
  );
  const counterMiss = keyClip("@counter:miss", [[0, watch], [0.6, watch], [1, stance]], 0.6, hipsRest);

  const ball: Pose = fists(
    { hips: [0, -0.42, 0], bones: { spine: [1.0, 0, 0], chest: [0.5, 0, 0], neck: [0.4, 0, 0], head: [0.3, 0, 0], leftUpperLeg: [-2.2, 0, 0.1], leftLowerLeg: [2.4, 0, 0], rightUpperLeg: [-2.2, 0, -0.1], rightLowerLeg: [2.4, 0, 0] } },
    { r: [-0.12, 0.2, 0.3], l: [0.12, 0.2, 0.3] },
  );

  return new Map([
    ["Running_A", run],
    ["@light0", light0],
    ["@light1", light1],
    ["@light2", light2],
    ["@heavy", heavy],
    ["@aerial", aerial],
    ["@special:projectile", beam],
    ["@special:rush", enterRush],
    ["@rush", rush],
    ["@special:leap", takeoff],
    ["@leap", leapClip],
    ["@leap:land", land],
    ["@special:area", burst],
    ["@special:counter", enterWatch],
    ["@counter", poseClip("@counter", watch, watchB, 1.2, hipsRest)],
    ["@counter:strike", counterStrike],
    ["@counter:miss", counterMiss],
    ...reactionClips(hipsRest, stance, guard, air, ball),
    ["Idle", poseClip("Idle", stance, stanceB, 2.0, hipsRest)],
    ["Blocking", poseClip("Blocking", guard, { ...guard, hips: [0, -0.2, 0] }, 1.4, hipsRest)],
    ["Jump_Idle", poseClip("Jump_Idle", air, airB, 0.8, hipsRest)],
  ]);
}
