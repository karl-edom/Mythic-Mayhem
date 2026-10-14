import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Retargeter, clenchFists } from "../src/client/retarget.ts";

function bone(name: string, parent: THREE.Object3D, pos: [number, number, number], rot = new THREE.Quaternion()): THREE.Object3D {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(...pos);
  b.quaternion.copy(rot);
  parent.add(b);
  return b;
}

/** Plays `clip` on `root` and holds its last frame. */
function poseAtEnd(root: THREE.Object3D, clip: THREE.AnimationClip): void {
  const mixer = new THREE.AnimationMixer(root);
  const a = mixer.clipAction(clip);
  a.setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.play();
  mixer.setTime(clip.duration);
}

function worldQuat(o: THREE.Object3D, root: THREE.Object3D): THREE.Quaternion {
  root.updateMatrixWorld(true);
  const q = new THREE.Quaternion();
  new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld).decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}

/** Source: short legs, bones with arbitrary rest rotations (like KayKit). Target: identity rests (like VRM). */
function rigs() {
  const source = new THREE.Group();
  const odd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -1.1, 0.7));
  const sHips = bone("hips", source, [0, 0.5, 0]);
  const sArm = bone("upperarml", sHips, [0.2, 0.6, 0], odd);
  const target = new THREE.Group();
  const tHips = bone("hips", target, [0, 1, 0]);
  const tArm = bone("leftUpperArm", tHips, [0.15, 0.4, 0]);
  const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.2);
  // The clip turns the source arm by `swing` in world space and lifts the hips by 0.1.
  const end = swing.clone().multiply(odd);
  const clip = new THREE.AnimationClip("test", 1, [
    new THREE.QuaternionKeyframeTrack("upperarml.quaternion", [0, 1], [...odd.toArray(), ...end.toArray()]),
    new THREE.VectorKeyframeTrack("hips.position", [0, 1], [0, 0.5, 0, 0, 0.6, 0]),
  ]);
  return { source, target, tArm, swing, clip };
}

test("reciblage : le mouvement du membre est le même quel que soit le repos du squelette", () => {
  const { source, target, tArm, swing, clip } = rigs();
  const r = new Retargeter({ source, target, map: { hips: "hips", "upperarm.l": "leftUpperArm" } });
  poseAtEnd(target, r.retarget(clip, 10));
  const delta = worldQuat(tArm, target);
  assert.ok(delta.angleTo(swing) < 1e-3, `écart ${delta.angleTo(swing)}`);
  // Hips lifted by 0.1 on legs half as long → 0.2 on the target.
  assert.ok(Math.abs(target.getObjectByName("hips")!.position.y - 1.2) < 1e-4);
});

test("reciblage : la source n'est pas modifiée et le baissé des bras s'applique", () => {
  const { source, target, tArm, swing, clip } = rigs();
  const before = source.getObjectByName("upperarml")!.quaternion.clone();
  const r = new Retargeter({ source, target, map: { hips: "hips", "upperarm.l": "leftUpperArm" }, armDrop: 0.3 });
  poseAtEnd(target, r.retarget(clip, 10));
  assert.ok(source.getObjectByName("upperarml")!.quaternion.equals(before));
  const expected = swing.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), 0.3));
  assert.ok(worldQuat(tArm, target).angleTo(expected) < 1e-3);
});

test("poings fermés : les doigts se replient vers la paume (vers le bas en pose en T)", () => {
  const root = new THREE.Group();
  const hand = bone("leftHand", root, [0.6, 1.4, 0]);
  const p = bone("leftIndexProximal", hand, [0.07, 0, 0]);
  const i = bone("leftIndexIntermediate", p, [0.03, 0, 0]);
  const d = bone("leftIndexDistal", i, [0.02, 0, 0]);
  const tip = bone("tip", d, [0.02, 0, 0]);
  root.updateMatrixWorld(true);
  const before = tip.getWorldPosition(new THREE.Vector3());
  clenchFists(root);
  root.updateMatrixWorld(true);
  const after = tip.getWorldPosition(new THREE.Vector3());
  assert.ok(after.y < before.y - 0.02, `bout du doigt ${before.y} → ${after.y}`);
  assert.ok(Math.abs(after.z - before.z) < 1e-6, "le doigt reste dans le plan de la main");
});
