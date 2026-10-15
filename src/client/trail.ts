// Weapon trail: a ribbon that follows the blade (or the fist) during a strike, like
// the swooshes of Smash or anime fighters. It shows exactly where the blow travels,
// which reads far better than a generic arc around the fighter.

import * as THREE from "three";
import { noOutline } from "./toon.ts";

/** Samples kept along the ribbon, and how long a sample lasts once the strike stops. */
const SAMPLES = 24;
const LIFE = 0.2;

interface Sample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

export class WeaponTrail {
  readonly mesh: THREE.Mesh;
  private samples: Sample[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private color = new THREE.Color();
  private white = new THREE.Color(0xffffff);

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(SAMPLES * 2 * 3);
    this.colors = new Float32Array(SAMPLES * 2 * 4);
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    const index: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      noOutline(
        new THREE.MeshBasicMaterial({
          vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        }),
      ),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /**
   * One frame: while `active`, the current blade segment (world space) is added; old
   * samples fade out. `color` tints the outer edge (the core stays white).
   */
  update(base: THREE.Vector3, tip: THREE.Vector3, active: boolean, dt: number, color: THREE.ColorRepresentation): void {
    for (const s of this.samples) s.age += dt;
    if (active) this.samples.push({ base: base.clone(), tip: tip.clone(), age: 0 });
    while (this.samples.length > SAMPLES || (this.samples.length && this.samples[0]!.age > LIFE)) this.samples.shift();
    const n = this.samples.length;
    this.mesh.visible = n >= 2;
    if (!this.mesh.visible) return;
    this.color.set(color);
    for (let i = 0; i < SAMPLES; i++) {
      // Unused slots collapse onto the newest sample (degenerate, invisible triangles).
      const s = this.samples[Math.min(i, n - 1)]!;
      const along = n > 1 ? Math.min(i, n - 1) / (n - 1) : 1; // 0 = oldest, 1 = newest
      const fade = Math.max(0, 1 - s.age / LIFE) * along;
      s.base.toArray(this.positions, i * 6);
      s.tip.toArray(this.positions, i * 6 + 3);
      // Base edge: faint coloured; tip edge: bright, white-hot near the newest sample.
      const tipColor = this.color.clone().lerp(this.white, along * 0.6);
      this.colors.set([this.color.r, this.color.g, this.color.b, fade * 0.15], i * 8);
      this.colors.set([tipColor.r, tipColor.g, tipColor.b, fade * 0.95], i * 8 + 4);
    }
    const geo = this.mesh.geometry;
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.color!.needsUpdate = true;
  }
}
