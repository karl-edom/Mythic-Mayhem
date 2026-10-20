// Weapon trail: a ribbon that follows the blade (or the fist) during a strike, like
// the swooshes of Smash or anime fighters. It shows exactly where the blow travels,
// which reads far better than a generic arc around the fighter.

import * as THREE from "three";
import { noOutline } from "./toon.ts";

/** Samples kept along the ribbon, and how long a sample lasts once the strike stops. */
const SAMPLES = 24;
const LIFE = 0.2;
/** Points drawn along the ribbon: the samples, smoothed along a curve. */
const POINTS = 48;
/** Across the ribbon, from the hilt to the edge: where the bands meet (0 = base, 1 = tip). */
const ROWS = [0, 0.72, 1];

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
    this.positions = new Float32Array(POINTS * ROWS.length * 3);
    this.colors = new Float32Array(POINTS * ROWS.length * 4);
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    const index: number[] = [];
    const n = ROWS.length;
    for (let i = 0; i < POINTS - 1; i++)
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j;
        index.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
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
   * samples fade out. `color` tints the ribbon; its edge (the tip side) is white-hot.
   */
  update(base: THREE.Vector3, tip: THREE.Vector3, active: boolean, dt: number, color: THREE.ColorRepresentation): void {
    for (const s of this.samples) s.age += dt;
    if (active) this.samples.push({ base: base.clone(), tip: tip.clone(), age: 0 });
    while (this.samples.length > SAMPLES || (this.samples.length && this.samples[0]!.age > LIFE)) this.samples.shift();
    const n = this.samples.length;
    this.mesh.visible = n >= 2;
    if (!this.mesh.visible) return;
    this.color.set(color);
    // Smooth curves through the samples (a few frames make a round sweep, not a fan of cuts).
    const bases = new THREE.CatmullRomCurve3(this.samples.map((s) => s.base), false, "centripetal");
    const tips = new THREE.CatmullRomCurve3(this.samples.map((s) => s.tip), false, "centripetal");
    const b = new THREE.Vector3();
    const t = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < POINTS; i++) {
      const along = i / (POINTS - 1); // 0 = oldest, 1 = newest
      bases.getPoint(along, b);
      tips.getPoint(along, t);
      const age = this.samples[Math.min(n - 1, Math.round(along * (n - 1)))]!.age;
      const fade = Math.max(0, 1 - age / LIFE) * along ** 0.8;
      ROWS.forEach((row, j) => {
        p.lerpVectors(b, t, row).toArray(this.positions, (i * ROWS.length + j) * 3);
        // Faint at the hilt, full colour across, white-hot along the edge.
        const alpha = row === 0 ? 0 : row < 1 ? 0.55 : 1;
        c.copy(this.color).lerp(this.white, row === 1 ? 0.35 + along * 0.55 : 0.1);
        this.colors.set([c.r, c.g, c.b, fade * alpha], (i * ROWS.length + j) * 4);
      });
    }
    const geo = this.mesh.geometry;
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.color!.needsUpdate = true;
  }
}
