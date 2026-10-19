// Signature moves of the swordsmen: each special a character is known for gets its own
// animation, chosen by name in character.json (`moves.{id}.pose`). The basic blows stay
// those of the weapon style; only the specials change. Clips are named after the move:
// "@gatotsu" for its start-up, then by phase: ":rush" (the charge), ":leap" (in the
// air) and ":land", ":wait" (counter stance), ":strike" and ":miss".

import * as THREE from "three";
import { fists } from "./fistPoses.ts";
import { keyClip, mix, over, poseClip, type Key, type Pose } from "./poses.ts";
import { armed, bodies, useBones, type BoneTable, type V } from "./swordPoses.ts";
import { SWORDSMAN_BONES } from "./swordsman.ts";

const L = (lu: V, ll: V) => ({ leftUpperArm: lu, leftLowerArm: ll });

/** All the signature clips, for a humanoid skeleton holding a sword in the right hand. */
export function signaturePoses(hipsRest: THREE.Vector3, bones: BoneTable = SWORDSMAN_BONES): Map<string, THREE.AnimationClip> {
  useBones(bones);
  const { low, lunge, tucked, turn } = bodies();
  const stance = armed(low, { at: [-0.03, 0.3, 0.33], blade: [0.25, 0.22, 1] });
  const out = new Map<string, THREE.AnimationClip>();
  const clip = (name: string, keys: Key[], duration: number, opts: { impact?: number; linear?: boolean; loop?: boolean } = {}) =>
    out.set(name, keyClip(name, keys, duration, hipsRest, opts));
  /** Running legs for a charge (lead leg forward, the other back), trunk pitched. */
  const dashLegs = (lead: 1 | -1, pitch = 0.55): Pose => ({
    hips: [0, -0.18, 0],
    bones: {
      spine: [pitch, 0, 0], chest: [0.1, 0, 0], head: [-pitch * 0.8, 0, 0],
      leftUpperLeg: [lead > 0 ? -1.1 : 0.6, 0, 0.1], leftLowerLeg: [lead > 0 ? 0.5 : 1.4, 0, 0],
      rightUpperLeg: [lead > 0 ? 0.6 : -1.1, 0, -0.1], rightLowerLeg: [lead > 0 ? 1.4 : 0.5, 0, 0],
    },
  });
  const deep: Pose = over(lunge, { leftUpperLeg: [-1.15, -0.1, 0.3], leftLowerLeg: [1.25, 0, 0], rightUpperLeg: [0.6, 0.1, -0.3], rightLowerLeg: [0.3, 0, 0], spine: [0.45, 0, 0], head: [-0.35, 0, 0] }, [0, -0.3, 0.14]);
  const kneel: Pose = over(deep, { rightUpperLeg: [0.2, 0.1, -0.25], rightLowerLeg: [1.7, 0, 0], rightFoot: [0.5, 0, 0], spine: [0.55, 0, 0] }, [0, -0.45, 0.12]);

  // ===== Saitō Hajime: the Gatotsu, a one-handed thrust launched from a sideways stance.
  // The stance: the hilt drawn back beside the head, the blade level and flat, pointing
  // at the foe; the free hand forward along the blade, aiming it.
  const gatotsuBody = turn(over(low, { leftUpperLeg: [-0.75, -0.2, 0.6], leftLowerLeg: [1.2, 0, 0], rightUpperLeg: [0.15, 0.2, -0.65], rightLowerLeg: [0.9, 0, 0], spine: [0.2, 0, 0], head: [-0.15, 0, 0] }, [0, -0.26, 0]), 0.75);
  const aim = (body: Pose, lift = 0) =>
    armed(body, { at: [-0.22, 0.58 + lift, -0.1], blade: [0.12, -0.02, 1], edge: [1, 0, 0], gap: -0.42, pole: [-0.9, -0.3, -0.4], offPole: [0.4, -1, 0.2] });
  const gatotsuStance = aim(gatotsuBody);
  const gatotsuHold = aim(over(gatotsuBody, {}, [0, -0.28, -0.02]), -0.01);
  clip("@gatotsu", [[0, stance], [0.42, gatotsuStance, "out"], [0.8, gatotsuHold], [1, gatotsuHold]], 0.6, { impact: 0.42 });
  // The charge: the sword arm fully out, the body behind it, the free arm flung back.
  const thrust = (lead: 1 | -1) =>
    armed(over(dashLegs(lead, 0.45), { spine: [0.45, -0.35, 0], chest: [0.1, -0.2, 0], head: [-0.35, 0.4, 0], ...L([0, 0.75, -1.1], [0, -0.3, 0]) }), {
      at: [0.02, 0.5, 0.62], blade: [0.02, 0, 1], edge: [1, 0, 0], two: false, pole: [-0.9, -0.3, 0],
    });
  clip("@gatotsu:rush", [[0, thrust(1)], [0.5, thrust(-1)], [1, thrust(1)]], 0.28, { loop: true });

  // Gatotsu Sanshiki: from a crouch, the thrust aimed up; in the air the point turns
  // down, and it comes down on the foe like a stake.
  const sanCrouch = aim(over(gatotsuBody, { leftUpperLeg: [-1.25, -0.2, 0.55], leftLowerLeg: [1.9, 0, 0], rightUpperLeg: [-0.4, 0.2, -0.6], rightLowerLeg: [1.7, 0, 0], spine: [0.4, 0, 0] }, [0, -0.42, 0]), -0.12);
  clip("@gatotsu-sanshiki", [[0, stance], [0.42, sanCrouch, "out"], [1, sanCrouch]], 0.5, { impact: 0.42 });
  const upThrust = armed({ hips: [0, 0, 0], bones: { spine: [-0.15, -0.3, 0], head: [0.2, 0.3, 0], leftUpperLeg: [-0.3, 0, 0.1], leftLowerLeg: [0.4, 0, 0], rightUpperLeg: [0.25, 0, -0.1], rightLowerLeg: [0.6, 0, 0], ...L([0, 0.6, -1.0], [0, -0.3, 0]) } }, {
    at: [-0.05, 1.0, 0.25], blade: [0.05, 1, 0.45], edge: [1, 0, 0], two: false, pole: [-1, 0, 0],
  });
  const turnDown = armed(over(tucked, { spine: [0.5, 0, 0], head: [-0.45, 0, 0] }), { at: [-0.05, 0.75, 0.25], blade: [0, -0.3, 1], edge: [1, 0, 0], two: false, pole: [-1, 0, 0] });
  const stake = armed(over(tucked, { spine: [0.75, 0, 0], head: [-0.6, 0, 0], leftUpperLeg: [-0.5, 0, 0.2], leftLowerLeg: [0.9, 0, 0], rightUpperLeg: [0.1, 0, -0.15], rightLowerLeg: [0.8, 0, 0] }), {
    at: [-0.02, 0.3, 0.4], blade: [0, -1, 0.35], edge: [1, 0, 0], two: false, pole: [-1, 0, 0],
  });
  clip("@gatotsu-sanshiki:leap", [[0, sanCrouch], [0.3, upThrust, "out"], [0.55, mix(upThrust, turnDown, 0.6)], [0.8, turnDown], [1, stake, "in"]], 1.0);
  const pinned = armed(kneel, { at: [-0.02, -0.15, 0.5], blade: [0, -1, 0.25], edge: [1, 0, 0], two: false, pole: [-1, 0, 0] });
  clip("@gatotsu-sanshiki:land", [[0, stake], [0.15, pinned, "in"], [0.5, pinned], [1, stance]], 0.8, { impact: 0.15 });

  // Gatotsu Zeroshiki: at zero distance, the whole upper body coiled far back, then
  // unwound in one burst; the feet barely move.
  const zeroCoil = armed(turn(over(low, { spine: [0.3, 0, 0], head: [-0.2, -0.4, 0] }, [0, -0.3, 0]), 1.15), {
    at: [-0.3, 0.42, -0.25], blade: [0.25, 0, 1], edge: [1, 0, 0], two: false, pole: [-0.6, -0.8, -0.3],
  });
  const zeroAim = fists(zeroCoil, { r: null, l: [0.08, 0.5, 0.5], lPole: [0.6, -1, 0] });
  clip("@gatotsu-zeroshiki", [[0, stance], [0.42, zeroAim, "out"], [1, over(zeroAim, {}, [0, -0.32, -0.02])]], 0.6, { impact: 0.42 });
  const zeroBurst = (k: number) =>
    armed(turn(over(lunge, { spine: [0.35, 0, 0], head: [-0.3, 0.3, 0], ...L([0, 0.7, -1.0], [0, -0.4, 0]) }, [0, -0.28, 0.05 * k]), -0.55), {
      at: [0.0, 0.48, 0.66], blade: [0, 0, 1], edge: [1, 0, 0], two: false, pole: [-0.9, -0.3, 0],
    });
  clip("@gatotsu-zeroshiki:rush", [[0, zeroBurst(0)], [0.5, zeroBurst(1)], [1, zeroBurst(0)]], 0.25, { loop: true });

  // ===== Shishio Makoto: the Mugenjin's tricks of fire.
  // Homura Dama: the blade scraped back along the ground (the friction lights the
  // grease), then swept up in a burning arc that throws the fire.
  const scrape = armed(turn(over(low, { spine: [0.45, 0, 0], head: [-0.3, 0, 0] }, [0, -0.32, 0]), 0.7), { at: [-0.35, 0.02, -0.15], blade: [-0.25, -0.55, -1], edge: [0, -1, 0], two: false, pole: [-0.4, 0, -1] });
  const scrapeFwd = armed(turn(over(low, { spine: [0.45, 0, 0], head: [-0.3, 0, 0] }, [0, -0.32, 0]), 0.35), { at: [-0.3, 0.0, 0.15], blade: [-0.3, -0.55, -0.8], edge: [0, -1, 0], two: false, pole: [-0.4, 0, -1] });
  const flare = armed(turn(over(lunge, { spine: [-0.1, 0, 0], head: [0.05, 0, 0], ...L([0, 0.5, -0.6], [0, -0.6, 0]) }, [0, -0.15, 0.05]), -0.5), {
    at: [0.15, 0.82, 0.3], blade: [0.35, 0.9, 0.3], edge: [0.3, 0.4, -1], two: false, pole: [-0.4, -1, 0],
  });
  clip("@homura-dama", [[0, stance], [0.2, scrape], [0.36, scrapeFwd], [0.42, flare, "in"], [0.62, flare], [1, stance]], 0.85, { impact: 0.42 });
  // Guren Kaina: the free hand thrust out to seize the foe (gunpowder in the glove),
  // the blade held back low; the blast goes off in that hand.
  const graspBody = turn(over(lunge, { spine: [0.3, 0, 0], head: [-0.2, 0, 0] }, [0, -0.25, 0.05]), -0.4);
  const grasp = fists(armed(graspBody, { at: [-0.32, 0.12, -0.2], blade: [-0.2, -0.4, -1], edge: [0, -1, 0], two: false, pole: [-0.3, 0, -1] }), { r: null, l: [0.06, 0.6, 0.62], lPole: [0.7, -0.8, 0] });
  const graspTight = fists(armed(over(graspBody, {}, [0, -0.27, 0.06]), { at: [-0.32, 0.12, -0.2], blade: [-0.2, -0.4, -1], edge: [0, -1, 0], two: false, pole: [-0.3, 0, -1] }), { r: null, l: [0.05, 0.58, 0.56], lPole: [0.7, -0.8, 0] });
  clip("@guren-kaina", [[0, stance], [0.3, grasp, "out"], [0.42, graspTight], [0.85, graspTight], [1, stance]], 0.95, { impact: 0.42 });
  // Kagutsuchi: the burning blade raised high above the head, then the charge with it,
  // brought down on whatever stands in the way.
  const raise = armed(over(low, { spine: [-0.15, 0, 0], chest: [-0.1, 0, 0], head: [0.1, 0, 0] }, [0, -0.18, 0]), { at: [-0.05, 0.95, -0.05], blade: [0.15, 0.8, -0.55], edge: [0, 0.5, 1] });
  clip("@kagutsuchi", [[0, stance], [0.42, raise, "out"], [1, over(raise, {}, [0, -0.2, 0])]], 0.6, { impact: 0.42 });
  const carry = (lead: 1 | -1) => armed(dashLegs(lead, 0.35), { at: [-0.05, 0.85, 0.05], blade: [0.1, 0.6, -0.8], edge: [0, 0.6, 1] });
  clip("@kagutsuchi:rush", [[0, carry(1)], [0.5, carry(-1)], [1, carry(1)]], 0.32, { loop: true });

  // ===== Sasuke Uchiha.
  // Chidori: the sword put away, crouched, the right hand low and back, crackling, the
  // left hand gripping its wrist; then the run, hand first.
  const chiBody = turn(over(low, { spine: [0.55, 0, 0], head: [-0.45, 0, 0], leftUpperLeg: [-1.0, -0.2, 0.55], leftLowerLeg: [1.6, 0, 0], rightUpperLeg: [-0.1, 0.2, -0.6], rightLowerLeg: [1.3, 0, 0] }, [0, -0.36, 0]), 0.45);
  const chiCharge = fists(chiBody, { r: [-0.3, -0.02, -0.25], l: [-0.22, 0.05, -0.15], rPole: [-0.4, 0.2, -1], lPole: [0.3, -0.3, -1] });
  const chiChargeB = fists(over(chiBody, {}, [0, -0.38, 0]), { r: [-0.31, -0.03, -0.26], l: [-0.23, 0.04, -0.16], rPole: [-0.4, 0.2, -1], lPole: [0.3, -0.3, -1] });
  clip("@chidori", [[0, stance], [0.42, chiCharge, "out"], [0.7, chiChargeB], [1, chiCharge]], 0.7, { impact: 0.42 });
  const chiRun = (lead: 1 | -1) => fists(dashLegs(lead, 0.6), { r: [-0.02, 0.4, 0.68], l: [0.25, 0.25, -0.2], rPole: [-0.6, -0.6, -0.3], lPole: [0.3, -0.3, -1] });
  clip("@chidori:rush", [[0, chiRun(1)], [0.5, chiRun(-1)], [1, chiRun(1)]], 0.3, { loop: true });
  // Katon, Gōkakyū no Jutsu: the hand signs before the mouth, a deep breath (chest up,
  // head back), then the fire blown out, head and trunk thrust forward.
  const signs = fists(over(low, { spine: [0.05, 0, 0], head: [-0.05, 0, 0] }, [0, -0.15, 0]), { r: [-0.02, 0.6, 0.2], l: [0.02, 0.6, 0.2], rPole: [-1, -0.6, 0], lPole: [1, -0.6, 0] });
  const signs2 = fists(over(low, { spine: [0.05, 0, 0] }, [0, -0.15, 0]), { r: [-0.01, 0.62, 0.17], l: [0.03, 0.57, 0.19], rPole: [-1, -0.3, 0], lPole: [1, -0.8, 0] });
  const breath = fists(over(low, { spine: [-0.2, 0, 0], chest: [-0.15, 0, 0], head: [0.25, 0, 0] }, [0, -0.12, -0.03]), { r: [-0.02, 0.66, 0.16], l: [0.02, 0.66, 0.16], rPole: [-1, -0.6, 0], lPole: [1, -0.6, 0] });
  const blow = fists(over(lunge, { spine: [0.35, 0, 0], chest: [0.1, 0, 0], neck: [0.1, 0, 0], head: [-0.15, 0, 0] }, [0, -0.2, 0.06]), { r: [-0.04, 0.6, 0.4], l: [0.0, 0.58, 0.36], rPole: [-1, -0.6, 0], lPole: [1, -0.6, 0] });
  clip("@katon", [[0, stance], [0.12, signs], [0.2, signs2], [0.28, signs], [0.36, breath], [0.42, blow, "in"], [0.8, blow], [1, stance]], 1.0, { impact: 0.42 });
  // Sharingan (counter): upright, still, the sword held point down along the forearm,
  // the eyes on the foe; caught, a turn and a backhand cut with the reversed blade.
  const readBody = over(low, { spine: [0.05, 0, 0], head: [-0.15, 0, 0] }, [0, -0.1, 0]);
  const read = armed(readBody, { at: [-0.22, 0.25, 0.12], blade: [-0.1, -0.35, -1], edge: [-1, 0, 0], two: false, pole: [-0.8, -0.6, 0] });
  const readB = armed(over(readBody, {}, [0, -0.12, 0]), { at: [-0.22, 0.24, 0.12], blade: [-0.1, -0.37, -1], edge: [-1, 0, 0], two: false, pole: [-0.8, -0.6, 0] });
  clip("@sharingan", [[0, stance], [0.42, read], [1, read]], 0.4, { impact: 0.42 });
  out.set("@sharingan:wait", poseClip("@sharingan:wait", read, readB, 1.4, hipsRest));
  const backhand = (yaw: number, k: number): Pose =>
    armed(over(lunge, { hips: [0, yaw, 0], spine: [0.2, 0, 0], ...L([0, 0.5, -1.0], [0, -0.6, 0]) }, [0, -0.2, 0]), {
      at: [-0.15 - 0.25 * k, 0.45, 0.25 + 0.15 * k], blade: [-0.3 - 0.7 * k, -0.1, -1 + 1.4 * k], edge: [-1, 0, 0.3], two: false,
    });
  clip("@sharingan:strike", [[0, backhand(Math.PI * 1.3, 0)], [0.3, backhand(Math.PI * 0.4, 0.5), "in"], [0.45, backhand(0, 1), "out"], [0.65, backhand(-0.1, 1)], [1, stance]], 0.6, { impact: 0 });
  clip("@sharingan:miss", [[0, read], [0.6, read], [1, stance]], 0.6);

  // ===== Leonardo: the leader's sword, in a ninja's ways.
  // Dragon blade (rush): the sword drawn back low in both hands, then a spinning drive,
  // the whole body turning like a drill behind the blade held level.
  const coil = armed(turn(over(low, { spine: [0.35, 0, 0] }, [0, -0.3, 0]), 0.8), { at: [-0.3, 0.18, -0.15], blade: [-0.3, -0.1, -1], edge: [0, -1, 0] });
  clip("@leo-dragon", [[0, stance], [0.42, coil, "out"], [1, over(coil, {}, [0, -0.32, 0])]], 0.5, { impact: 0.42 });
  const drill = (yaw: number) => armed(over(dashLegs(1, 0.3), { hips: [0, yaw, 0] }), { at: [-0.3, 0.38, 0.25], blade: [-0.6, 0.02, 0.8], edge: [-0.8, 0, -0.6], two: false });
  clip("@leo-dragon:rush", [[0, drill(0)], [0.25, drill(-Math.PI / 2)], [0.5, drill(-Math.PI)], [0.75, drill(-Math.PI * 1.5)], [1, drill(-Math.PI * 2)]], 0.32, { loop: true, linear: true });
  // Leader's guard (counter): the blade upright before the face, both hands, waiting;
  // caught, a step through and a rising cut behind the attacker.
  const wall = armed(over(low, { spine: [0.1, 0, 0] }, [0, -0.2, 0]), { at: [-0.02, 0.38, 0.3], blade: [0.05, 1, 0.12], edge: [0, 0, 1] });
  const wallB = armed(over(low, { spine: [0.1, 0, 0] }, [0, -0.22, 0]), { at: [-0.02, 0.37, 0.3], blade: [0.05, 1, 0.14], edge: [0, 0, 1] });
  clip("@leo-guard", [[0, stance], [0.42, wall], [1, wall]], 0.4, { impact: 0.42 });
  out.set("@leo-guard:wait", poseClip("@leo-guard:wait", wall, wallB, 1.2, hipsRest));
  const riseAt = (yaw: number, k: number): Pose =>
    armed(over(lunge, { hips: [0, yaw, 0], spine: [0.25 - 0.3 * k, 0, 0] }, [0, -0.22 + 0.08 * k, 0]), { at: [0.05 - 0.2 * k, 0.15 + 0.55 * k, 0.3], blade: [0.3 - 0.6 * k, -0.6 + 1.5 * k, 0.5], edge: [0, 1, 0.3] });
  clip("@leo-guard:strike", [[0, riseAt(Math.PI, 0)], [0.3, riseAt(Math.PI * 0.3, 0.3), "in"], [0.45, riseAt(0, 1), "out"], [0.65, riseAt(0, 1)], [1, stance]], 0.6, { impact: 0 });
  clip("@leo-guard:miss", [[0, wall], [0.6, wall], [1, stance]], 0.6);
  // Ninja leap: a front somersault in the air, the sword tucked, then the cut on landing.
  const tuck = armed(tucked, { at: [-0.1, 0.4, 0.2], blade: [0, -0.3, -1], edge: [0, -1, 0] });
  const flip = (a: number) => over(tuck, { hips: [a, 0, 0] });
  const crouch = armed(over(low, { spine: [0.5, 0, 0], head: [-0.35, 0, 0], leftUpperLeg: [-1.2, -0.1, 0.45], leftLowerLeg: [1.8, 0, 0], rightUpperLeg: [-0.7, 0.1, -0.45], rightLowerLeg: [1.6, 0, 0] }, [0, -0.36, 0]), { at: [-0.25, 0.12, -0.05], blade: [-0.2, -0.3, -1], edge: [0, -1, 0] });
  clip("@leo-flip", [[0, stance], [0.42, crouch], [1, crouch]], 0.5, { impact: 0.42 });
  const overhead = armed(over(tucked, { spine: [0.2, 0, 0] }), { at: [0, 0.85, 0.1], blade: [0, 0.6, -0.8], edge: [0, 1, 0.3] });
  clip("@leo-flip:leap", [[0, crouch], [0.15, flip(0)], [0.35, flip(Math.PI * 0.7)], [0.55, flip(Math.PI * 1.4)], [0.7, flip(Math.PI * 2)], [0.85, overhead], [1, overhead]], 1.0, { linear: true });
  const cut = armed(kneel, { at: [0.0, 0.18, 0.5], blade: [0, -0.55, 1], edge: [0, -1, -0.4] });
  clip("@leo-flip:land", [[0, overhead], [0.15, cut, "in"], [0.45, cut], [1, stance]], 0.8, { impact: 0.15 });

  return out;
}
