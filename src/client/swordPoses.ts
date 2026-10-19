// Hand-keyed poses of the swordsman, from its reference sheet: low wide stances, a
// two-handed sword. Bodies are keyed by angle like the turtle's (see poses.ts); the arms
// are solved: a pose says where the sword hand is and where the blade points, and a
// two-bone solver places the arm, the off hand closing on the grip below it.

import * as THREE from "three";
import { keyClip, mix, over, poseClip, reactionClips, type Key, type Pose } from "./poses.ts";
import { SWORDSMAN_BONES } from "./swordsman.ts";

export type V = [number, number, number];

export type BoneTable = [string, string | null, number, number, number][];
const restOf = (table: BoneTable) => new Map(table.map(([name, parent, x, y, z]) => [name, { parent, pos: new THREE.Vector3(x, y, z) }]));
/** Rest skeleton the solver works on: set by each entry point for the model it poses. */
let REST = restOf(SWORDSMAN_BONES);
/** Sets the rest skeleton the solver works on (each style's entry point calls it). */
export function useBones(bones: BoneTable): void {
  REST = restOf(bones);
}
/** One-handed weapons (a club, a pan, a bottle): the off hand never joins the grip. */
let ONE_HAND = false;
/** The free arm of a one-handed style: forward, bent, for balance and guard. */
const OFF_GUARD: Pose["bones"] = { leftUpperArm: [0, -0.9, -0.95], leftLowerArm: [0, -1.2, 0], leftHand: [0, 0, 0.2] };

const euler = new THREE.Euler();
/** Local rotation of a bone in a pose. */
function local(p: Pose, bone: string): THREE.Quaternion {
  const v = p.q?.[bone];
  if (v) return new THREE.Quaternion(v[0], v[1], v[2], v[3]);
  const [x, y, z] = p.bones[bone] ?? [0, 0, 0];
  return new THREE.Quaternion().setFromEuler(euler.set(x, y, z, "XYZ"));
}

/** Rig-space rotation and position of a bone in a pose (forward kinematics). */
export function fk(p: Pose, bone: string): { q: THREE.Quaternion; pos: THREE.Vector3 } {
  const r = REST.get(bone)!;
  if (!r.parent) {
    const h = p.hips ?? [0, 0, 0];
    return { q: local(p, bone), pos: r.pos.clone().add(new THREE.Vector3(...h)) };
  }
  const parent = fk(p, r.parent);
  const offset = r.pos.clone().sub(REST.get(r.parent)!.pos).applyQuaternion(parent.q);
  return { q: parent.q.clone().multiply(local(p, bone)), pos: parent.pos.clone().add(offset) };
}

const X = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Rotation taking `from` to `to`, then turned about `to` by the angle that best serves `score`. */
function aimTwisted(from: THREE.Vector3, to: THREE.Vector3, score: (q: THREE.Quaternion) => number): THREE.Quaternion {
  const swing = new THREE.Quaternion().setFromUnitVectors(from, to);
  let best = swing;
  let bestScore = -Infinity;
  for (let i = 0; i < 36; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(to, (i / 36) * Math.PI * 2).multiply(swing);
    const s = score(q);
    if (s > bestScore) {
      bestScore = s;
      best = q;
    }
  }
  return best;
}

/** Hand rotation (rig space) holding a sword along `blade`, its edge toward `edge`. */
function gripRotation(blade: THREE.Vector3, edge: THREE.Vector3): THREE.Quaternion {
  // At rest a held sword points along +Z, edge down (−Y), in the hand's frame.
  const z = blade.clone().normalize();
  const down = edge.clone().addScaledVector(z, -edge.dot(z));
  if (down.lengthSq() < 1e-6) down.set(0, -1, 0).addScaledVector(z, z.y);
  const y = down.normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const qArr = (q: THREE.Quaternion): [number, number, number, number] => [q.x, q.y, q.z, q.w];

/**
 * Solves one arm so that its hand reaches `target` (rig space) with rotation `hand`
 * (rig space; null keeps the wrist straight). The elbow bends toward `pole`. Twists are
 * chosen to keep the sleeves hanging and the wrist as straight as it can be.
 */
export function solveArm(p: Pose, side: 1 | -1, target: THREE.Vector3, hand: THREE.Quaternion | null, pole: THREE.Vector3): Pose["q"] {
  const s = side > 0 ? "left" : "right";
  const chest = fk(p, "chest");
  const restU = REST.get(`${s}UpperArm`)!.pos;
  const restL = REST.get(`${s}LowerArm`)!.pos;
  const restH = REST.get(`${s}Hand`)!.pos;
  const shoulder = chest.pos.clone().add(restU.clone().sub(REST.get("chest")!.pos).applyQuaternion(chest.q));
  const a = restL.distanceTo(restU);
  const b = restH.distanceTo(restL);
  const d = target.clone().sub(shoulder);
  const dist = Math.min(Math.max(d.length(), Math.abs(a - b) + 0.01), a + b - 0.002);
  const dir = d.normalize();
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = shoulder.clone().addScaledVector(dir, a * cosA).addScaledVector(bend, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  const wrist = shoulder.clone().addScaledVector(dir, dist);
  const rest = X.clone().multiplyScalar(side);
  const upDir = elbow.clone().sub(shoulder).normalize();
  const loDir = wrist.clone().sub(elbow).normalize();
  // Upper arm: its underside (sleeve) as near the floor as it can.
  const wu = aimTwisted(rest, upDir, (q) => DOWN.clone().applyQuaternion(q).dot(DOWN));
  // Forearm: the twist that leaves the least for the wrist to do.
  const wl = aimTwisted(rest, loDir, (q) =>
    hand ? Math.abs(q.clone().invert().multiply(hand).w) : DOWN.clone().applyQuaternion(q).dot(DOWN),
  );
  const out: NonNullable<Pose["q"]> = {
    [`${s}UpperArm`]: qArr(chest.q.clone().invert().multiply(wu)),
    [`${s}LowerArm`]: qArr(wu.clone().invert().multiply(wl)),
    [`${s}Hand`]: qArr(hand ? wl.clone().invert().multiply(hand) : new THREE.Quaternion()),
  };
  return out;
}

export interface Grip {
  /** Sword hand, from the hips (in the hips' frame), metres. */
  at: V;
  /** Where the blade points, and where its edge faces (hips' frame). */
  blade: V;
  edge?: V;
  /** Both hands on the grip (default), or the off hand left as the body pose has it. */
  two?: boolean;
  /** Distance between the hands along the weapon (the off hand below the sword hand). */
  gap?: number;
  /** Elbow directions (rig space), sword arm and off arm. */
  pole?: V;
  offPole?: V;
}

/** The body pose with its arms solved to hold the sword as `g` says. */
export function armed(body: Pose, g: Grip): Pose {
  const hips = fk(body, "hips");
  const at = new THREE.Vector3(...g.at).applyQuaternion(hips.q).add(hips.pos);
  const blade = new THREE.Vector3(...g.blade).normalize().applyQuaternion(hips.q);
  const edge = new THREE.Vector3(...(g.edge ?? [0, -1, 0.2])).applyQuaternion(hips.q);
  const grip = gripRotation(blade, edge);
  const p: Pose = { hips: body.hips, bones: { ...body.bones }, q: { ...(body.q ?? {}) } };
  if (ONE_HAND) {
    g = { ...g, two: false };
    if (!p.bones.leftUpperArm && !p.q!.leftUpperArm) Object.assign(p.bones, OFF_GUARD);
  }
  for (const b of ["rightUpperArm", "rightLowerArm", "rightHand"]) delete p.bones[b];
  Object.assign(p.q!, solveArm(body, -1, at, grip, new THREE.Vector3(...(g.pole ?? [-0.6, -1, -0.4]))));
  if (g.two !== false) {
    for (const b of ["leftUpperArm", "leftLowerArm", "leftHand"]) delete p.bones[b];
    // The off hand closes on the grip just below the sword hand.
    const off = at.clone().addScaledVector(blade, -(g.gap ?? 0.095));
    Object.assign(p.q!, solveArm(body, 1, off, grip, new THREE.Vector3(...(g.offPole ?? [0.6, -1, -0.4]))));
  }
  return p;
}

const L = (lu: V, ll: V) => ({ leftUpperArm: lu, leftLowerArm: ll });

/** Bodies (legs, trunk, head) shared by the weapon styles, from the swordsman's sheet. */
export function bodies() {

  /** Low, wide stance (sheet, third pose): knees out, weight forward, eyes on the foe. */
  const low: Pose = {
    hips: [0, -0.2, 0],
    bones: {
      spine: [0.18, 0.12, 0],
      chest: [0.06, 0.08, 0],
      neck: [-0.05, -0.1, 0],
      head: [-0.12, -0.12, 0],
      leftUpperLeg: [-0.6, -0.15, 0.55],
      leftLowerLeg: [0.95, 0, 0],
      leftFoot: [-0.3, 0, -0.45],
      rightUpperLeg: [0.05, 0.15, -0.6],
      rightLowerLeg: [0.75, 0, 0],
      rightFoot: [-0.35, 0, 0.5],
    },
  };
  const lunge: Pose = {
    hips: [0, -0.24, 0.06],
    bones: {
      ...low.bones,
      spine: [0.3, 0, 0],
      leftUpperLeg: [-1.0, -0.1, 0.35],
      leftLowerLeg: [1.2, 0, 0],
      leftFoot: [-0.2, 0, -0.3],
      rightUpperLeg: [0.45, 0.1, -0.35],
      rightLowerLeg: [0.35, 0, 0],
      rightFoot: [-0.3, 0, 0.3],
    },
  };
  const tucked: Pose = {
    hips: [0, 0, 0],
    bones: {
      spine: [0.15, 0, 0],
      head: [-0.15, 0, 0],
      leftUpperLeg: [-1.4, 0, 0.2],
      leftLowerLeg: [1.9, 0, 0],
      leftFoot: [0.3, 0, 0],
      rightUpperLeg: [-0.5, 0, -0.15],
      rightLowerLeg: [1.6, 0, 0],
      rightFoot: [0.4, 0, 0],
    },
  };
  const turn = (p: Pose, spine: number, hipsY = 0): Pose =>
    over(p, { spine: [p.bones.spine?.[0] ?? 0, spine, 0], chest: [p.bones.chest?.[0] ?? 0, spine * 0.5, 0], head: [p.bones.head?.[0] ?? 0, -spine * 1.2, 0], hips: [0, hipsY, 0] });
  return { low, lunge, tucked, turn };
}


/** The sword style on a humanoid skeleton (the swordsman's by default, or the turtle's). */
export function swordsmanPoses(hipsRest: THREE.Vector3, bones: BoneTable = SWORDSMAN_BONES, opts: { oneHand?: boolean } = {}): Map<string, THREE.AnimationClip> {
  REST = restOf(bones);
  ONE_HAND = !!opts.oneHand;
  try {
    return swordClips(hipsRest, ONE_HAND);
  } finally {
    ONE_HAND = false;
  }
}

function swordClips(hipsRest: THREE.Vector3, oneHand: boolean): Map<string, THREE.AnimationClip> {
  const { low, lunge, tucked, turn } = bodies();

  // ---- Stances.
  const stance = armed(low, { at: [-0.03, 0.3, 0.33], blade: [0.25, 0.22, 1] });
  const stanceB = armed({ ...low, hips: [0, -0.22, 0] }, { at: [-0.03, 0.28, 0.34], blade: [0.25, 0.25, 1] });
  // Guard: the blade held across, high, its back to the foe.
  const guard = armed(over(low, { spine: [0.05, 0, 0], head: [-0.05, 0, 0] }, [0, -0.15, 0]), { at: [-0.16, 0.62, 0.3], blade: [1, 0.18, 0.15], edge: [0, 0.2, -1] });
  // In the air: sword raised overhead, point back (jōdan).
  const air = armed(tucked, { at: [0.0, 0.75, 0.08], blade: [0, 0.55, -1], edge: [0, 1, 0.3] });
  const airB = armed(over(tucked, { leftUpperLeg: [-1.3, 0, 0.2], rightUpperLeg: [-0.4, 0, -0.15] }), { at: [0.0, 0.77, 0.06], blade: [0, 0.5, -1], edge: [0, 1, 0.3] });

  // ---- Run: low, pitched forward, the sword in one hand trailing back and low.
  const runBody = (lead: "left" | "right", phase: "contact" | "pass"): Pose => {
    const a = lead;
    const b = lead === "left" ? "right" : "left";
    const sw = lead === "left" ? 1 : -1;
    const legs: Pose["bones"] =
      phase === "contact"
        ? { [`${a}UpperLeg`]: [-1.05, 0, 0.05 * sw], [`${a}LowerLeg`]: [0.4, 0, 0], [`${a}Foot`]: [0.15, 0, 0], [`${b}UpperLeg`]: [0.55, 0, -0.05 * sw], [`${b}LowerLeg`]: [1.25, 0, 0], [`${b}Foot`]: [0.5, 0, 0] }
        : { [`${a}UpperLeg`]: [-0.25, 0, 0.05 * sw], [`${a}LowerLeg`]: [0.5, 0, 0], [`${a}Foot`]: [-0.1, 0, 0], [`${b}UpperLeg`]: [-0.6, 0, -0.05 * sw], [`${b}LowerLeg`]: [1.9, 0, 0], [`${b}Foot`]: [0.3, 0, 0] };
    const body: Pose = {
      hips: phase === "contact" ? [0, -0.1, 0] : [0, -0.03, 0],
      bones: {
        ...legs,
        spine: [0.5, 0.15 * sw * (phase === "contact" ? 1 : 0.3), 0],
        chest: [0.1, 0, 0],
        neck: [-0.25, 0, 0],
        head: [-0.35, 0, 0],
        ...L([0, -0.4 + 0.5 * sw, -1.15], [0, -0.7, 0]),
      },
    };
    return armed(body, { at: [-0.28, 0.08 + 0.03 * sw, -0.18 - 0.06 * sw], blade: [-0.15, -0.2, -1], edge: [0, -1, 0], two: false, pole: [-0.3, -0.3, -1] });
  };
  const run = keyClip(
    "Running_A",
    [[0, runBody("left", "contact")], [0.25, runBody("left", "pass")], [0.5, runBody("right", "contact")], [0.75, runBody("right", "pass")], [1, runBody("left", "contact")]],
    0.6,
    hipsRest,
    { loop: true },
  );

  // ---- Blows: settle into the coil, burst into the cut, carry through, back to the stance.
  const blow = (coil: Pose, hit: Pose, rest: Pose = stance, reach = 1.1): Key[] => [
    [0, rest],
    [0.3, coil],
    [0.42, hit, "in"],
    [0.54, mix(coil, hit, reach), "out"],
    [0.72, mix(hit, rest, 0.3)],
    [1, rest],
  ];
  // Light 1: flat cut from right to left, the trunk unwinding.
  const yokoCoil = armed(turn(low, 0.45), { at: [-0.32, 0.3, 0.08], blade: [-0.7, 0.1, -0.7], edge: [-0.7, 0, 0.7] });
  const yoko = armed(turn(lunge, -0.4), { at: [0.08, 0.33, 0.44], blade: [1, 0.05, 0.55], edge: [0.55, 0, -1] });
  const light0 = keyClip("@light0", blow(yokoCoil, yoko), 0.6, hipsRest, { impact: 0.42 });
  // Light 2: rising cut from low left to high right (kiri-age).
  const ageCoil = armed(turn(low, -0.35), { at: [0.2, 0.08, 0.25], blade: [0.55, -0.6, -0.5], edge: [0.3, -1, 0.4] });
  const age = armed(turn(lunge, 0.35), { at: [-0.18, 0.6, 0.36], blade: [-0.55, 0.75, 0.4], edge: [-0.5, 0.7, -0.4] });
  const light1 = keyClip("@light1", blow(ageCoil, age), 0.6, hipsRest, { impact: 0.42 });
  // Light 3 (finisher): from overhead, straight down the centre with a long step.
  const jodan = armed(over(low, { spine: [-0.08, 0, 0], chest: [-0.05, 0, 0], head: [0.0, 0, 0] }, [0, -0.15, -0.03]), { at: [0.0, 0.78, 0.12], blade: [0, 0.55, -1], edge: [0, 1, 0.4] });
  const deep: Pose = over(lunge, { leftUpperLeg: [-1.15, -0.1, 0.3], leftLowerLeg: [1.25, 0, 0], rightUpperLeg: [0.6, 0.1, -0.3], rightLowerLeg: [0.3, 0, 0], spine: [0.45, 0, 0], head: [-0.35, 0, 0] }, [0, -0.3, 0.14]);
  const karatake = armed(deep, { at: [0.0, 0.32, 0.52], blade: [0, -0.35, 1], edge: [0, -1, -0.3] });
  const light2 = keyClip("@light2", blow(jodan, karatake, stance, 1.08), 0.8, hipsRest, { impact: 0.42 });

  // Heavy: raised high on the right (hassō, held while charging), then a full diagonal cut.
  const hasso = armed(turn(over(low, { spine: [-0.05, 0, 0] }), 0.3), { at: [-0.22, 0.72, 0.05], blade: [-0.25, 0.85, -0.45], edge: [-0.3, 0.4, 1] });
  const hassoHigh = armed(turn(over(low, { spine: [-0.12, 0, 0], chest: [-0.08, 0, 0] }), 0.4), { at: [-0.2, 0.8, -0.02], blade: [-0.2, 0.7, -0.7], edge: [-0.3, 0.6, 1] });
  const kesa = armed(turn(deep, -0.35), { at: [0.18, 0.22, 0.46], blade: [0.6, -0.5, 0.6], edge: [0.5, -1, -0.3] });
  const heavy = keyClip(
    "@heavy",
    [[0, stance], [0.24, hasso], [0.32, hassoHigh], [0.42, kesa, "in"], [0.52, mix(hassoHigh, kesa, 1.07), "out"], [0.72, mix(kesa, stance, 0.3)], [1, stance]],
    1.0,
    hipsRest,
    { impact: 0.42 },
  );

  // Aerial: a flat whirling cut in the air.
  const airCoil = armed(turn(tucked, 0.5), { at: [-0.3, 0.35, 0.0], blade: [-0.8, 0.05, -0.6], edge: [-0.6, 0, 0.8] });
  const airCut = armed(turn(over(tucked, { leftUpperLeg: [-0.9, 0, 0.3], rightUpperLeg: [-0.2, 0, -0.2] }), -0.5), { at: [0.12, 0.38, 0.42], blade: [1, 0, 0.45], edge: [0.45, 0, -1] });
  const aerial = keyClip("@aerial", blow(airCoil, airCut, air, 1.12), 0.6, hipsRest, { impact: 0.42 });

  // ---- Dragon Hammer Flash (leap): a crouch, a leap high above, the dive and the cut.
  const crouch = armed(over(low, { spine: [0.5, 0, 0], head: [-0.35, 0, 0], leftUpperLeg: [-1.2, -0.1, 0.45], leftLowerLeg: [1.8, 0, 0], rightUpperLeg: [-0.7, 0.1, -0.45], rightLowerLeg: [1.6, 0, 0] }, [0, -0.36, 0]), {
    at: [-0.25, 0.12, -0.05], blade: [-0.2, -0.3, -1], edge: [0, -1, 0],
  });
  const takeoff = keyClip("@special:leap", [[0, stance], [0.42, crouch], [1, crouch]], 0.5, hipsRest, { impact: 0.42 });
  const rising = armed({ hips: [0, 0, 0], bones: { spine: [-0.1, 0, 0], head: [0.05, 0, 0], leftUpperLeg: [-0.2, 0, 0.1], leftLowerLeg: [0.3, 0, 0], leftFoot: [0.6, 0, 0], rightUpperLeg: [0.1, 0, -0.1], rightLowerLeg: [0.4, 0, 0], rightFoot: [0.6, 0, 0] } }, {
    at: [0.0, 0.95, 0.1], blade: [0, 1, 0.15], edge: [0, 0, 1],
  });
  const peak = armed(over(tucked, { spine: [0.25, 0, 0], head: [-0.2, 0, 0] }), { at: [0.0, 0.8, 0.0], blade: [0, 0.5, -1], edge: [0, 1, 0.3] });
  const dive = armed(over(tucked, { spine: [0.55, 0, 0], chest: [0.15, 0, 0], head: [-0.45, 0, 0], leftUpperLeg: [-0.7, 0, 0.2], leftLowerLeg: [1.0, 0, 0], rightUpperLeg: [0.2, 0, -0.15], rightLowerLeg: [0.9, 0, 0] }), {
    at: [0.0, 0.85, 0.15], blade: [0, 0.75, -0.6], edge: [0, 1, 0.5],
  });
  const leapClip = keyClip("@leap", [[0, crouch], [0.25, rising, "out"], [0.55, peak], [0.85, dive], [1, dive]], 1.0, hipsRest);
  const kneel: Pose = over(deep, { rightUpperLeg: [0.2, 0.1, -0.25], rightLowerLeg: [1.7, 0, 0], rightFoot: [0.5, 0, 0], spine: [0.55, 0, 0] }, [0, -0.45, 0.12]);
  const hammer = armed(kneel, { at: [0.0, 0.18, 0.5], blade: [0, -0.55, 1], edge: [0, -1, -0.4] });
  const land = keyClip("@leap:land", [[0, dive], [0.15, hammer, "in"], [0.45, hammer], [1, stance]], 0.8, hipsRest, { impact: 0.15 });

  // ---- Dragon Coil Flash (counter): a low waiting stance, the blade back along the hip
  // as if sheathed; caught, a full turn and a flat cut.
  const waitBody = turn(over(low, { spine: [0.3, 0, 0], leftUpperLeg: [-0.7, -0.15, 0.6], leftLowerLeg: [1.2, 0, 0], rightUpperLeg: [0.1, 0.15, -0.65], rightLowerLeg: [0.95, 0, 0] }, [0, -0.28, 0]), 0.35);
  const wait = armed(waitBody, { at: [0.12, 0.12, 0.12], blade: [0.25, -0.15, -1], edge: [0, -1, 0] });
  const waitB = armed(over(waitBody, {}, [0, -0.3, 0]), { at: [0.12, 0.11, 0.12], blade: [0.25, -0.17, -1], edge: [0, -1, 0] });
  const enterWait = keyClip("@special:counter", [[0, stance], [0.42, wait], [1, wait]], 0.4, hipsRest, { impact: 0.42 });
  const spinAt = (yaw: number, k: number): Pose =>
    armed(over(lunge, { hips: [0, yaw, 0], spine: [0.25, 0, 0], ...L([0, 0.45, -1.05], [0, -0.9, 0]) }, [0, -0.22, 0]), { at: [-0.3 - 0.15 * k, 0.4, 0.15 + 0.2 * k], blade: [-0.6 + 1.4 * k, 0.05, 0.8], edge: [0.8, 0, -0.5], two: false });
  const counterStrike = keyClip(
    "@counter:strike",
    [[0, spinAt(Math.PI * 1.4, 0)], [0.3, spinAt(Math.PI * 0.4, 0.5), "in"], [0.45, spinAt(0, 1), "out"], [0.65, spinAt(-0.15, 1)], [1, stance]],
    0.7,
    hipsRest,
    { impact: 0 },
  );
  const counterMiss = keyClip("@counter:miss", [[0, wait], [0.6, wait], [1, stance]], 0.6, hipsRest);

  // ---- Nine-Headed Dragon Flash (rush): the thrusting stance, then the charge.
  const chargeStance = armed(over(lunge, { spine: [0.35, 0, 0], head: [-0.3, 0, 0] }, [0, -0.3, 0]), { at: [-0.08, 0.28, 0.32], blade: [0.05, 0.05, 1], edge: [0, -1, 0] });
  const enterCharge = keyClip("@special:rush", [[0, stance], [0.42, chargeStance, "in"], [1, chargeStance]], 0.5, hipsRest, { impact: 0.42 });
  const dash = (lead: 1 | -1): Pose =>
    armed(
      {
        hips: [0, -0.18, 0],
        bones: {
          spine: [0.55, 0, 0],
          chest: [0.1, 0, 0],
          head: [-0.45, 0, 0],
          leftUpperLeg: [lead > 0 ? -1.1 : 0.6, 0, 0.1],
          leftLowerLeg: [lead > 0 ? 0.5 : 1.4, 0, 0],
          rightUpperLeg: [lead > 0 ? 0.6 : -1.1, 0, -0.1],
          rightLowerLeg: [lead > 0 ? 1.4 : 0.5, 0, 0],
        },
      },
      { at: [-0.05, 0.3, 0.42], blade: [0, -0.05, 1], edge: [0, -1, 0] },
    );
  const rush = keyClip("@rush", [[0, dash(1)], [0.5, dash(-1)], [1, dash(1)]], 0.3, hipsRest, { loop: true });

  // ---- Projectile. With a sword: a rising cut that sends its wave (or its flame) at the
  // foe. One-handed: the weapon (a gun, a rifle) shouldered in both hands, aimed, and a
  // recoil at the shot.
  let shot: THREE.AnimationClip;
  if (oneHand) {
    ONE_HAND = false;
    const aimBody = turn(over(low, { spine: [0.08, 0, 0], head: [-0.05, 0, 0] }, [0, -0.16, 0]), 0.5);
    const aim = armed(aimBody, { at: [-0.12, 0.5, 0.32], blade: [0.12, 0.02, 1], edge: [0, -1, 0], gap: 0.22 });
    const aimB = armed(aimBody, { at: [-0.12, 0.505, 0.32], blade: [0.12, 0.03, 1], edge: [0, -1, 0], gap: 0.22 });
    const kick = armed(over(aimBody, { spine: [-0.08, 0, 0], head: [0.08, 0, 0] }, [0, -0.15, -0.04]), { at: [-0.12, 0.56, 0.24], blade: [0.12, 0.35, 1], edge: [0, -1, 0], gap: 0.22 });
    shot = keyClip("@special:projectile", [[0, stance], [0.2, aim], [0.38, aimB], [0.42, kick, "out"], [0.6, aim], [0.85, aim], [1, stance]], 1.0, hipsRest, { impact: 0.42 });
    ONE_HAND = true;
  } else shot = keyClip("@special:projectile", blow(ageCoil, age, stance, 1.12), 0.75, hipsRest, { impact: 0.42 });

  // ---- Area: a full turn, the blade flat at arm's length, twice round.
  const whirlAt = (yaw: number): Pose =>
    armed(over(lunge, { hips: [0, yaw, 0], spine: [0.25, 0, 0], ...L([0, 0.45, -1.05], [0, -0.9, 0]) }, [0, -0.22, 0]), { at: [-0.4, 0.4, 0.3], blade: [-0.2, 0.02, 1], edge: [-1, 0, 0], two: false });
  const whirl = keyClip(
    "@special:area",
    [[0, stance], [0.2, whirlAt(0)], [0.42, whirlAt(-Math.PI)], [0.64, whirlAt(-Math.PI * 2)], [0.86, whirlAt(-Math.PI * 3)], [1, whirlAt(-Math.PI * 4)]],
    0.9,
    hipsRest,
    { impact: 0.42, linear: true },
  );

  // Rolls tuck the sword along the body.
  const ball: Pose = armed(
    {
      hips: [0, -0.42, 0],
      bones: { spine: [1.0, 0, 0], chest: [0.5, 0, 0], neck: [0.4, 0, 0], head: [0.3, 0, 0], leftUpperLeg: [-2.2, 0, 0.1], leftLowerLeg: [2.4, 0, 0], rightUpperLeg: [-2.2, 0, -0.1], rightLowerLeg: [2.4, 0, 0] },
    },
    { at: [-0.12, 0.25, 0.25], blade: [0, -0.4, -1], edge: [0, -1, 0] },
  );

  return new Map([
    ["Running_A", run],
    ["@light0", light0],
    ["@light1", light1],
    ["@light2", light2],
    ["@heavy", heavy],
    ["@aerial", aerial],
    ["@special:leap", takeoff],
    ["@leap", leapClip],
    ["@leap:land", land],
    ["@special:counter", enterWait],
    ["@counter", poseClip("@counter", wait, waitB, 1.2, hipsRest)],
    ["@counter:strike", counterStrike],
    ["@counter:miss", counterMiss],
    ["@special:rush", enterCharge],
    ["@rush", rush],
    ["@special:projectile", shot],
    ["@special:area", whirl],
    ...reactionClips(hipsRest, stance, guard, air, ball),
    ["Idle", poseClip("Idle", stance, stanceB, 2.4, hipsRest)],
    ["Blocking", poseClip("Blocking", guard, { ...guard, hips: [0, -0.16, 0] }, 1.4, hipsRest)],
    ["Jump_Idle", poseClip("Jump_Idle", air, airB, 0.8, hipsRest)],
  ]);
}

/**
 * The staff style (bō) on a humanoid skeleton: both hands on the staff, well apart, the
 * long end toward the foe. Thrusts, sweeps, smashes from overhead, a whirl, a vault.
 */
export function staffPoses(hipsRest: THREE.Vector3, bones: BoneTable = SWORDSMAN_BONES): Map<string, THREE.AnimationClip> {
  REST = restOf(bones);
  const { low, lunge, tucked, turn } = bodies();
  /** Both hands on the staff, 45 cm apart; `blade` points along its long end. */
  const held = (body: Pose, at: V, end: V, extra: Partial<Grip> = {}) => armed(body, { at, blade: end, edge: [0, 1, 0], gap: 0.45, ...extra });

  // Ready: across the body from the left hip, the long end forward and up toward the foe.
  const stance = held(low, [0.04, 0.33, 0.36], [-0.3, 0.32, 1]);
  const stanceB = held({ ...low, hips: [0, -0.22, 0] }, [0.04, 0.31, 0.37], [-0.3, 0.35, 1]);
  // Guard: the staff held level, high, across the front.
  const guard = held(over(low, { spine: [0.05, 0, 0] }, [0, -0.15, 0]), [-0.22, 0.6, 0.3], [-1, 0.06, 0.05]);
  const air = held(tucked, [-0.22, 0.72, 0.1], [-1, 0.1, 0]);
  const airB = held(over(tucked, { leftUpperLeg: [-1.3, 0, 0.2] }), [-0.22, 0.74, 0.08], [-1, 0.12, 0]);

  // Run: held in the right hand at the balance, level, long end behind.
  const runBody = (lead: 1 | -1, contact: boolean): Pose => {
    const [a, b] = lead > 0 ? ["left", "right"] : ["right", "left"];
    const legs: Pose["bones"] = contact
      ? { [`${a}UpperLeg`]: [-1.05, 0, 0], [`${a}LowerLeg`]: [0.4, 0, 0], [`${a}Foot`]: [0.15, 0, 0], [`${b}UpperLeg`]: [0.55, 0, 0], [`${b}LowerLeg`]: [1.25, 0, 0], [`${b}Foot`]: [0.5, 0, 0] }
      : { [`${a}UpperLeg`]: [-0.25, 0, 0], [`${a}LowerLeg`]: [0.5, 0, 0], [`${a}Foot`]: [-0.1, 0, 0], [`${b}UpperLeg`]: [-0.6, 0, 0], [`${b}LowerLeg`]: [1.9, 0, 0], [`${b}Foot`]: [0.3, 0, 0] };
    const body: Pose = {
      hips: contact ? [0, -0.1, 0] : [0, -0.03, 0],
      bones: { ...legs, spine: [0.45, 0.12 * lead, 0], chest: [0.1, 0, 0], head: [-0.35, 0, 0], ...L([0, -0.4 + 0.5 * lead, -1.15], [0, -0.7, 0]) },
    };
    return held(body, [-0.3, 0.12, -0.05], [0.05, 0.05, -1], { two: false, pole: [-0.3, -0.3, -1] });
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
  const deep: Pose = over(lunge, { leftUpperLeg: [-1.15, -0.1, 0.3], leftLowerLeg: [1.25, 0, 0], rightUpperLeg: [0.6, 0.1, -0.3], rightLowerLeg: [0.3, 0, 0], spine: [0.45, 0, 0], head: [-0.35, 0, 0] }, [0, -0.3, 0.14]);
  // Light 1: a straight thrust with the end.
  const pull = held(turn(low, 0.25), [-0.02, 0.32, 0.1], [-0.15, 0.1, 1]);
  const thrust = held(turn(lunge, -0.2), [0.02, 0.34, 0.58], [-0.05, 0.05, 1]);
  const light0 = keyClip("@light0", blow(pull, thrust), 0.6, hipsRest, { impact: 0.42 });
  // Light 2: a flat sweep from right to left.
  const sweepCoil = held(turn(low, 0.5), [-0.3, 0.35, 0.1], [-0.9, 0.15, -0.35]);
  const sweep = held(turn(lunge, -0.45), [0.12, 0.36, 0.4], [0.95, 0.1, 0.55]);
  const light1 = keyClip("@light1", blow(sweepCoil, sweep), 0.6, hipsRest, { impact: 0.42 });
  // Light 3 (finisher): overhead, brought straight down with a long step.
  const raised = held(over(low, { spine: [-0.08, 0, 0] }, [0, -0.15, -0.03]), [-0.05, 0.78, 0.08], [0, 0.85, -0.5]);
  const smash = held(deep, [0, 0.3, 0.5], [0, -0.3, 1]);
  const light2 = keyClip("@light2", blow(raised, smash, stance, 1.08), 0.8, hipsRest, { impact: 0.42 });
  // Heavy: wound up high on the right (held while charging), a full diagonal blow.
  const wind = held(turn(over(low, { spine: [-0.05, 0, 0] }), 0.4), [-0.25, 0.7, 0.0], [-0.4, 0.8, -0.5]);
  const windHigh = held(turn(over(low, { spine: [-0.12, 0, 0] }), 0.5), [-0.22, 0.8, -0.05], [-0.3, 0.75, -0.65]);
  const crash = held(turn(deep, -0.35), [0.15, 0.24, 0.48], [0.55, -0.45, 0.7]);
  const heavy = keyClip(
    "@heavy",
    [[0, stance], [0.24, wind], [0.32, windHigh], [0.42, crash, "in"], [0.52, mix(windHigh, crash, 1.07), "out"], [0.72, mix(crash, stance, 0.3)], [1, stance]],
    1.0,
    hipsRest,
    { impact: 0.42 },
  );
  // Aerial: a flat spinning sweep.
  const airCoil = held(turn(tucked, 0.5), [-0.3, 0.38, 0.05], [-0.85, 0.05, -0.5]);
  const airSweep = held(turn(over(tucked, { leftUpperLeg: [-0.9, 0, 0.3] }), -0.5), [0.12, 0.38, 0.42], [1, 0, 0.45]);
  const aerial = keyClip("@aerial", blow(airCoil, airSweep, air, 1.12), 0.6, hipsRest, { impact: 0.42 });

  // ---- Pole vault (leap): plant the long end ahead, swing up over it, come down smashing.
  const plant = held(over(lunge, { spine: [0.4, 0, 0], head: [-0.3, 0, 0] }, [0, -0.28, 0.05]), [0, 0.55, 0.25], [0, -0.85, 0.55]);
  const takeoff = keyClip("@special:leap", [[0, stance], [0.42, plant, "in"], [1, plant]], 0.5, hipsRest, { impact: 0.42 });
  const vault = held({ hips: [0, 0, 0], bones: { spine: [-0.2, 0, 0], head: [0.1, 0, 0], leftUpperLeg: [-0.9, 0, 0.15], leftLowerLeg: [0.6, 0, 0], rightUpperLeg: [-0.7, 0, -0.15], rightLowerLeg: [0.5, 0, 0] } }, [0, 0.55, 0.08], [0, -1, 0.25]);
  const top = held(over(tucked, { spine: [0.25, 0, 0], head: [-0.2, 0, 0] }), [0, 0.78, 0.0], [0, 0.6, -1]);
  const dive = held(over(tucked, { spine: [0.5, 0, 0], head: [-0.4, 0, 0], leftUpperLeg: [-0.7, 0, 0.2], leftLowerLeg: [1.0, 0, 0], rightUpperLeg: [0.2, 0, -0.15], rightLowerLeg: [0.9, 0, 0] }), [0, 0.85, 0.12], [0, 0.8, -0.6]);
  const leapClip = keyClip("@leap", [[0, plant], [0.3, vault, "out"], [0.6, top], [0.88, dive], [1, dive]], 1.0, hipsRest);
  const kneel: Pose = over(deep, { rightUpperLeg: [0.2, 0.1, -0.25], rightLowerLeg: [1.7, 0, 0], rightFoot: [0.5, 0, 0], spine: [0.55, 0, 0] }, [0, -0.45, 0.12]);
  const slam = held(kneel, [0, 0.16, 0.48], [0, -0.5, 1]);
  const land = keyClip("@leap:land", [[0, dive], [0.15, slam, "in"], [0.45, slam], [1, stance]], 0.8, hipsRest, { impact: 0.15 });

  // ---- Whirl (area): the staff spun level round the body, twice.
  const spinAt = (yaw: number): Pose => held(over(low, { hips: [0, yaw, 0], spine: [0.15, 0, 0] }, [0, -0.2, 0]), [-0.18, 0.4, 0.18], [-1, 0.05, 0.25]);
  const whirl = keyClip(
    "@special:area",
    [[0, stance], [0.2, spinAt(0)], [0.42, spinAt(Math.PI)], [0.64, spinAt(Math.PI * 2)], [0.86, spinAt(Math.PI * 3)], [1, spinAt(Math.PI * 4)]],
    0.9,
    hipsRest,
    { impact: 0.42, linear: true },
  );

  // ---- Charge (rush): the staff levelled like a lance.
  const lance = held(over(lunge, { spine: [0.35, 0, 0], head: [-0.3, 0, 0] }, [0, -0.3, 0]), [0.02, 0.3, 0.35], [-0.05, 0.02, 1]);
  const enterCharge = keyClip("@special:rush", [[0, stance], [0.42, lance, "in"], [1, lance]], 0.5, hipsRest, { impact: 0.42 });
  const dash = (lead: 1 | -1): Pose =>
    held(
      {
        hips: [0, -0.18, 0],
        bones: {
          spine: [0.55, 0, 0], chest: [0.1, 0, 0], head: [-0.45, 0, 0],
          leftUpperLeg: [lead > 0 ? -1.1 : 0.6, 0, 0.1], leftLowerLeg: [lead > 0 ? 0.5 : 1.4, 0, 0],
          rightUpperLeg: [lead > 0 ? 0.6 : -1.1, 0, -0.1], rightLowerLeg: [lead > 0 ? 1.4 : 0.5, 0, 0],
        },
      },
      [0.02, 0.3, 0.42], [-0.05, 0, 1],
    );
  const rush = keyClip("@rush", [[0, dash(1)], [0.5, dash(-1)], [1, dash(1)]], 0.3, hipsRest, { loop: true });

  const ball: Pose = held(
    { hips: [0, -0.42, 0], bones: { spine: [1.0, 0, 0], chest: [0.5, 0, 0], neck: [0.4, 0, 0], head: [0.3, 0, 0], leftUpperLeg: [-2.2, 0, 0.1], leftLowerLeg: [2.4, 0, 0], rightUpperLeg: [-2.2, 0, -0.1], rightLowerLeg: [2.4, 0, 0] } },
    [-0.1, 0.25, 0.25], [0, -0.3, -1],
  );

  return new Map([
    ["Running_A", run],
    ["@light0", light0],
    ["@light1", light1],
    ["@light2", light2],
    ["@heavy", heavy],
    ["@aerial", aerial],
    ["@special:leap", takeoff],
    ["@leap", leapClip],
    ["@leap:land", land],
    ["@special:area", whirl],
    ["@special:rush", enterCharge],
    ["@rush", rush],
    ...reactionClips(hipsRest, stance, guard, air, ball),
    ["Idle", poseClip("Idle", stance, stanceB, 2.4, hipsRest)],
    ["Blocking", poseClip("Blocking", guard, { ...guard, hips: [0, -0.16, 0] }, 1.4, hipsRest)],
    ["Jump_Idle", poseClip("Jump_Idle", air, airB, 0.8, hipsRest)],
  ]);
}
