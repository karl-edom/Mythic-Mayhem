// Animation retargeting: plays the shared KayKit clips on any humanoid skeleton.
//
// Both rigs rest in a T-pose facing +Z, so a bone's motion can be carried over as
// its rotation away from the rest pose, measured in the model's own space:
//   Δ(t) = Wsrc(t) · Wsrc_rest⁻¹        (source bone, world rotation)
//   Wdst(t) = Δ(t) · Wdst_rest          (target bone)
// then each target bone's local rotation follows from its parent's. Bones the source
// lacks (neck, shoulders, upper chest, fingers) keep their rest pose relative to
// their parent. The hips also carry the source's vertical and horizontal motion,
// scaled by leg length.
// Pure three.js: also runs (and is tested) under Node.

import * as THREE from "three";

/** KayKit bone → VRM humanoid bone. */
export const KAYKIT_TO_HUMANOID: Record<string, string> = {
  hips: "hips",
  spine: "spine",
  chest: "chest",
  head: "head",
  "upperarm.l": "leftUpperArm",
  "lowerarm.l": "leftLowerArm",
  "hand.l": "leftHand",
  "upperarm.r": "rightUpperArm",
  "lowerarm.r": "rightLowerArm",
  "hand.r": "rightHand",
  "upperleg.l": "leftUpperLeg",
  "lowerleg.l": "leftLowerLeg",
  "foot.l": "leftFoot",
  "toes.l": "leftToes",
  "upperleg.r": "rightUpperLeg",
  "lowerleg.r": "rightLowerLeg",
  "foot.r": "rightFoot",
  "toes.r": "rightToes",
};

/** three.js strips dots from node names on load ("upperarm.l" → "upperarml"). */
const loaded = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

interface Rest {
  quat: THREE.Quaternion;
  pos: THREE.Vector3;
}

/** World transform of `o` expressed in `root`'s space, from the current matrices. */
function inRoot(o: THREE.Object3D, root: THREE.Object3D): Rest {
  const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  m.decompose(pos, quat, new THREE.Vector3());
  return { quat, pos };
}

export interface RetargetRig {
  source: THREE.Object3D;
  target: THREE.Object3D;
  /** source bone name (as authored) → target bone name. */
  map: Record<string, string>;
  /**
   * Lowers the target's arms by this angle (radians) under every pose. Chibi rigs hold
   * their arms wide of a big body; slim anime bodies need them closer.
   */
  armDrop?: number;
}

const ARM_CHAIN = /^(left|right)(UpperArm|LowerArm|Hand)$/;

/** What retargeting needs to know about both skeletons at rest; built once per target model. */
export class Retargeter {
  private source: THREE.Object3D;
  private target: THREE.Object3D;
  private pairs: { src: THREE.Object3D; dst: THREE.Object3D }[] = [];
  private srcRest = new Map<THREE.Object3D, Rest>();
  private dstRest = new Map<THREE.Object3D, Rest>();
  /** Target bones from the root down (parents before children), up to the deepest mapped one. */
  private order: THREE.Object3D[] = [];
  private mapped = new Map<THREE.Object3D, THREE.Object3D>();
  private srcHips: THREE.Object3D | null = null;
  private dstHips: THREE.Object3D | null = null;
  private legRatio = 1;
  /** Extra rest-frame rotation per target bone (arms). */
  private offset = new Map<THREE.Object3D, THREE.Quaternion>();

  constructor(rig: RetargetRig) {
    // A private copy: sampling poses the source skeleton.
    this.source = rig.source.clone(true);
    this.target = rig.target;
    this.source.updateMatrixWorld(true);
    rig.target.updateMatrixWorld(true);
    for (const [s, d] of Object.entries(rig.map)) {
      const src = this.source.getObjectByName(loaded(s));
      const dst = rig.target.getObjectByName(d);
      if (!src || !dst) continue;
      this.pairs.push({ src, dst });
      this.mapped.set(dst, src);
      this.srcRest.set(src, inRoot(src, this.source));
    }
    rig.target.traverse((o) => {
      if (o !== rig.target) this.dstRest.set(o, inRoot(o, rig.target));
    });
    rig.target.traverse((o) => {
      if (o === rig.target) return;
      // Keep bones on the path to a mapped bone, plus the mapped bones themselves.
      let hasMapped = false;
      o.traverse((c) => {
        if (this.mapped.has(c)) hasMapped = true;
      });
      if (hasMapped) this.order.push(o);
    });
    const drop = rig.armDrop ?? 0;
    if (drop) {
      for (const dst of this.mapped.keys()) {
        const m = ARM_CHAIN.exec(dst.name);
        if (!m) continue;
        // Arms rest along ±X; turning them toward −Y is a rotation about ∓Z.
        const axis = new THREE.Vector3(0, 0, m[1] === "left" ? -1 : 1);
        this.offset.set(dst, new THREE.Quaternion().setFromAxisAngle(axis, drop));
      }
    }
    this.srcHips = this.source.getObjectByName(loaded("hips")) ?? null;
    this.dstHips = rig.target.getObjectByName("hips") ?? null;
    if (this.srcHips && this.dstHips) {
      const hs = this.srcRest.get(this.srcHips)?.pos.y ?? 1;
      const hd = this.dstRest.get(this.dstHips)!.pos.y;
      this.legRatio = hd / Math.max(1e-6, hs);
    }
  }

  /** Bakes `clip` (authored for the source rig) into an equivalent clip for the target rig. */
  /**
   * `hipsVertical` scales the hips' vertical motion: chibi rigs crouch and bounce a lot,
   * which on long legs reads as a collapse (and sinks the feet into the ground).
   */
  retarget(clip: THREE.AnimationClip, fps = 30, hipsVertical = 1): THREE.AnimationClip {
    const mixer = new THREE.AnimationMixer(this.source);
    const action = mixer.clipAction(clip);
    // Play once and hold the end: a looping action would wrap the last frame back to the first.
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames);
    const rot = new Map<THREE.Object3D, Float32Array>();
    for (const { dst } of this.pairs) rot.set(dst, new Float32Array(frames * 4));
    const hipsPos = new Float32Array(frames * 3);
    const world = new Map<THREE.Object3D, THREE.Quaternion>();
    const delta = new THREE.Quaternion();
    const local = new THREE.Quaternion();
    const parentInv = new THREE.Quaternion();
    const identity = new THREE.Quaternion();

    for (let i = 0; i < frames; i++) {
      const t = Math.min(clip.duration, (i / (frames - 1)) * clip.duration);
      times[i] = t;
      mixer.setTime(t);
      this.source.updateMatrixWorld(true);
      world.clear();
      for (const o of this.order) {
        const parentWorld = world.get(o.parent!) ?? this.dstRest.get(o.parent!)?.quat ?? identity;
        const src = this.mapped.get(o);
        let w: THREE.Quaternion;
        if (src) {
          const now = inRoot(src, this.source).quat;
          delta.copy(now).multiply(this.srcRest.get(src)!.quat.clone().invert());
          w = delta.clone();
          const off = this.offset.get(o);
          if (off) w.multiply(off);
          w.multiply(this.dstRest.get(o)!.quat);
        } else {
          // Unmapped bone: keeps its rest rotation relative to its (possibly moving) parent.
          w = parentWorld.clone().multiply(o.quaternion);
        }
        world.set(o, w);
        if (src) {
          local.copy(parentInv.copy(parentWorld).invert()).multiply(w);
          local.toArray(rot.get(o)!, i * 4);
        }
      }
      if (this.srcHips && this.dstHips) {
        const now = inRoot(this.srcHips, this.source).pos;
        const move = now.sub(this.srcRest.get(this.srcHips)!.pos).multiplyScalar(this.legRatio);
        move.y *= hipsVertical;
        const p = this.dstRest.get(this.dstHips)!.pos.clone().add(move);
        // Into the hips' parent space.
        const parent = this.dstHips.parent!;
        const m = new THREE.Matrix4().copy(this.target.matrixWorld).invert().multiply(parent.matrixWorld).invert();
        p.applyMatrix4(m).toArray(hipsPos, i * 3);
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(this.source);

    const tracks: THREE.KeyframeTrack[] = [];
    for (const [dst, values] of rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${dst.name}.quaternion`, times, values));
    if (this.dstHips) tracks.push(new THREE.VectorKeyframeTrack(`${this.dstHips.name}.position`, times, hipsPos));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
}

/**
 * Closes the hands into fists (the source rig has no fingers): each finger joint bends
 * toward the palm around a fixed axis, so the bend adds up along the finger.
 * Expects VRM finger bone names and a T-pose with palms down, in `root`'s space.
 */
export function clenchFists(root: THREE.Object3D, angle = 1.25): void {
  root.updateMatrixWorld(true);
  const down = new THREE.Vector3(0, -1, 0);
  for (const side of ["left", "right"]) {
    for (const finger of ["Thumb", "Index", "Middle", "Ring", "Little"]) {
      const names = finger === "Thumb" ? ["Metacarpal", "Proximal", "Distal"] : ["Proximal", "Intermediate", "Distal"];
      const bones = names.map((n) => root.getObjectByName(`${side}${finger}${n}`));
      if (bones.some((b) => !b)) continue;
      const rest = bones.map((b) => inRoot(b!, root));
      const tip = rest[2]!.pos.clone().sub(rest[1]!.pos);
      // Thumbs wrap less and from the side.
      const along = tip.lengthSq() > 1e-10 ? tip.normalize() : new THREE.Vector3(side === "left" ? 1 : -1, 0, 0);
      const axis = new THREE.Vector3().crossVectors(along, down).normalize();
      const bend = new THREE.Quaternion().setFromAxisAngle(axis, finger === "Thumb" ? angle * 0.45 : angle);
      bones.forEach((b, i) => {
        const w = rest[i]!.quat;
        // local' = local · (W⁻¹ · R · W): rotates the bone by R in root space.
        b!.quaternion.multiply(w.clone().invert().multiply(bend).multiply(w));
      });
    }
  }
}

/**
 * Exaggerates a clip: every joint moves `k` times as far from the clip's first pose
 * (rotations scaled by angle, hips displacement scaled too). Attacks start from a
 * guard stance, so wind-ups and follow-throughs grow; looping clips stay seamless
 * (their last frame equals the first, which is left unchanged). Angles are capped
 * below a half turn so that nothing flips over.
 */
export function amplifyClip(
  clip: THREE.AnimationClip,
  k: number,
  about: "first" | "mean" = "first",
  legs?: number,
): THREE.AnimationClip {
  if (k === 1 && legs === undefined) return clip;
  if (about === "mean") return scaleAboutMean(clip, (track) => (legs !== undefined && LEG_TRACK.test(track) ? legs : k));
  const ref = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const tracks = clip.tracks.map((t) => {
    const out = t.clone();
    const v = out.values;
    if (t instanceof THREE.QuaternionKeyframeTrack) {
      ref.fromArray(v, 0);
      const inv = ref.clone().invert();
      for (let i = 4; i < v.length; i += 4) {
        q.fromArray(v, i).premultiply(inv); // ref⁻¹ · q
        if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        const angle = 2 * Math.acos(Math.min(1, q.w));
        if (angle < 1e-5) continue;
        axis.set(q.x, q.y, q.z).normalize();
        q.setFromAxisAngle(axis, Math.min(angle * k, Math.PI * 0.95));
        ref.clone().multiply(q).toArray(v, i);
      }
    } else if (t instanceof THREE.VectorKeyframeTrack) {
      for (let i = 3; i < v.length; i++) v[i] = v[i % 3]! + (v[i]! - v[i % 3]!) * k;
    }
    return out;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Scales every joint's swing around its average pose: k < 1 tones a cycle down (shorter
 * strides, smaller bounce) without changing the posture it swings around.
 */
function scaleAboutMean(clip: THREE.AnimationClip, kOf: (track: string) => number): THREE.AnimationClip {
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const tracks = clip.tracks.map((t) => {
    const k = kOf(t.name);
    const out = t.clone();
    const v = out.values;
    if (t instanceof THREE.QuaternionKeyframeTrack) {
      // Average orientation: sign-aligned sum, normalised (fine for the moderate swings of a cycle).
      const mean = new THREE.Quaternion(0, 0, 0, 0);
      const first = new THREE.Quaternion().fromArray(v, 0);
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i);
        const sgn = q.dot(first) < 0 ? -1 : 1;
        mean.set(mean.x + sgn * q.x, mean.y + sgn * q.y, mean.z + sgn * q.z, mean.w + sgn * q.w);
      }
      mean.normalize();
      const inv = mean.clone().invert();
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i).premultiply(inv);
        if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        const angle = 2 * Math.acos(Math.min(1, q.w));
        if (angle < 1e-5) continue;
        axis.set(q.x, q.y, q.z).normalize();
        q.setFromAxisAngle(axis, angle * k);
        mean.clone().multiply(q).toArray(v, i);
      }
    } else if (t instanceof THREE.VectorKeyframeTrack) {
      const n = v.length / 3;
      for (let c = 0; c < 3; c++) {
        let m = 0;
        for (let i = 0; i < n; i++) m += v[i * 3 + c]!;
        m /= n;
        for (let i = 0; i < n; i++) v[i * 3 + c] = m + (v[i * 3 + c]! - m) * k;
      }
    }
    return out;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Leg rotation tracks (thighs, shins, feet), which set the length of a stride. */
const LEG_TRACK = /(UpperLeg|LowerLeg|Foot|Toes)\.quaternion$/;

/**
 * Locomotion cycles: the upper body is toned down around its average pose; the legs
 * swing wider (longer strides), so the cycle covers the ground at a natural cadence.
 */
export const LOCOMOTION_LEGS = 1.12;

/** Locomotion cycles: toned down around their average pose on long anime legs. */
export const LOCOMOTION = /^(Running_A|Running_B|Running_Strafe_Left|Running_Strafe_Right|Walking_Backwards)$/;

/** How much each kind of clip is exaggerated on slim anime bodies (chibi moves are small). */
export function amplitudeFor(name: string): number {
  if (/Attack|Spellcast_Shoot|Spellcast_Long|Throw|Ranged/.test(name)) return 1.5;
  if (/Hit_|Block_Hit|Dodge|Death|Lie_StandUp|Cheer|Jump_Start|Jump_Land|PickUp/.test(name)) return 1.3;
  if (LOCOMOTION.test(name)) return 0.75;
  return 1;
}
