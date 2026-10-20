// The picture after the scene is drawn: ambient occlusion in the corners (GTAO), a
// bloom on what glows (lanterns, techniques), a light colour grade (a touch more
// saturation and contrast, a soft vignette), then tone mapping. The fighters' ink
// outline is drawn with the scene. Quality adapts by itself: if frames take too long,
// the occlusion goes first, then the bloom, then the resolution drops a little.
// Three.js's own post-processing passes: no new dependency.

import * as THREE from "three";
import type { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Draws the scene (and the ink outlines) into the composer's buffer. */
class SceneOutlinePass extends Pass {
  private effect: OutlineEffect;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  constructor(effect: OutlineEffect, scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.effect = effect;
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    renderer.clear();
    this.effect.render(this.scene, this.camera);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
    warmth: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
    vignette: { value: 0.28 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, vignette;
    uniform vec3 warmth;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * warmth;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      // Contrast around mid-grey, in linear light (0.18).
      col = max(vec3(0.0), (col - 0.18) * contrast + 0.18);
      float d = length((vUv - 0.5) * vec2(1.15, 1.0));
      col *= mix(1.0, smoothstep(0.9, 0.3, d), vignette);
      gl_FragColor = vec4(col, c.a);
    }`,
};

/**
 * Light (linear, before tone mapping) above which things glow. A white garment in full
 * sun reaches about 1.2: under this, it would shine like a lantern. Lanterns, techniques
 * and sparks are drawn brighter than that (see vfx: HDR).
 */
export const BLOOM_THRESHOLD = 1.6;
const HDR_BOOST = 2.4;

export type Quality = "high" | "medium" | "low";

export class PostFX {
  private composer: EffectComposer;
  private ao: GTAOPass;
  private bloom: UnrealBloomPass;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private settleUntil = 0;
  quality: Quality = "high";
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, outline: OutlineEffect) {
    this.renderer = renderer;
    this.scene = scene;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new SceneOutlinePass(outline, scene, camera));
    this.ao = new GTAOPass(scene, camera, size.x, size.y);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.2, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1 });
    // The occlusion pass draws the scene again (depth and normals) with every object
    // opaque: glows, billboards and faded walls would cast dark shadows, and cut-out
    // foliage cards would darken whole squares. It already leaves out points and lines;
    // leave out see-through and cut-out things and sprites too.
    const pass = this.ao as unknown as { scene: THREE.Scene; _visibilityCache: THREE.Object3D[]; _overrideVisibility: () => void };
    pass._overrideVisibility = () => {
      pass.scene.traverse((o) => {
        if (!o.visible) return;
        const see = o instanceof THREE.Points || o instanceof THREE.Line || o instanceof THREE.Sprite ||
          (o instanceof THREE.Mesh && ([o.material].flat() as THREE.Material[]).some((m) => m.transparent || m.alphaTest > 0 || m.blending !== THREE.NormalBlending));
        if (see) {
          o.visible = false;
          pass._visibilityCache.push(o);
        }
      });
    };
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, BLOOM_THRESHOLD);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());
    this.settleUntil = performance.now() + 4000;
  }

  dispose(): void {
    this.composer.dispose();
    this.ao.dispose();
    this.bloom.dispose();
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** Draws a frame; watches how long frames take and lowers the quality if needed. */
  render(): void {
    const now = performance.now();
    if (this.lastFrame) {
      this.frameTimes.push(now - this.lastFrame);
      if (this.frameTimes.length > 90) this.frameTimes.shift();
    }
    this.lastFrame = now;
    // Judged on steady frames only (not while loading), and one step at a time.
    // (A test page can pin the quality: window.__fixedQuality.)
    const pinned = (globalThis as { __fixedQuality?: boolean }).__fixedQuality;
    if (!pinned && now > this.settleUntil && this.frameTimes.length >= 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avg > 24) this.lower();
    }
    this.brightenEffects();
    this.composer.render();
  }

  /**
   * Additive effects (sparks, beams, glows) are drawn HDR_BOOST times brighter than
   * their colour, once, when they first appear: above the bloom threshold, they glow,
   * while lit surfaces, even white ones, do not.
   */
  private brightenEffects(): void {
    this.scene.traverseVisible((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of [mats].flat() as THREE.MeshBasicMaterial[]) {
        if (m.blending !== THREE.AdditiveBlending || m.userData.hdr || !m.color) continue;
        m.userData.hdr = true;
        m.color.multiplyScalar(HDR_BOOST);
      }
    });
  }

  private lower(): void {
    this.frameTimes = [];
    this.settleUntil = performance.now() + 3000;
    if (this.quality === "high") {
      this.quality = "medium";
      this.ao.enabled = false;
    } else if (this.quality === "medium") {
      this.quality = "low";
      this.bloom.enabled = false;
      this.renderer.setPixelRatio(Math.max(1, this.renderer.getPixelRatio() * 0.75));
      const s = this.renderer.getSize(new THREE.Vector2());
      this.setSize(s.x, s.y);
    }
  }
}
