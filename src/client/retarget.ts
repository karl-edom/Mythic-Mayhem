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
  retarget(clip: THREE.AnimationClip, fps = 30): THREE.AnimationClip {
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
