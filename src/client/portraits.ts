// Character « photos » for the menus, rendered from the fighters' own 3D models in a
// small studio: a warm key light, a cool fill, a strong rim light in the character's
// colour from behind, the same ink outline as in the arena. Transparent background, so
// the menus lay them over their own frames. Two cuts: a bust (roster tiles) and a full
// figure (player panels, versus screen). Rendered once each, in the background.

import * as THREE from "three";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Character } from "../brawl/character.ts";
import type { FighterKit } from "../brawl/kit.ts";
import { defaultLook, instantiate, proceduralEnv, type ModelLibrary } from "./models.ts";

export type PortraitCut = "bust" | "full";

const SIZE: Record<PortraitCut, [number, number]> = { bust: [256, 256], full: [360, 540] };

export class PortraitStudio {
  private renderer: THREE.WebGLRenderer;
  private outline: OutlineEffect;
  private scene = new THREE.Scene();
  private rim = new THREE.DirectionalLight(0xffffff, 3.2);
  private cache = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private lib: ModelLibrary;
  /** Reflections made by this renderer (a texture of the arena's renderer cannot be used here). */
  private env: THREE.Texture;

  constructor(lib: ModelLibrary) {
    this.lib = lib;
    const canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setClearColor(0x000000, 0);
    this.env = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.4;
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3550, 1.1));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.1);
    key.position.set(1.6, 2.6, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.8);
    fill.position.set(-3, 1.2, 2);
    this.scene.add(fill);
    this.rim.position.set(-1.5, 2.4, -3);
    this.scene.add(this.rim);
    const rim2 = this.rim.clone();
    rim2.position.set(2, 1.8, -2.5);
    rim2.intensity = 2;
    this.scene.add(rim2);
    this.outline = new OutlineEffect(this.renderer, { defaultThickness: 0.0035, defaultColor: [0.06, 0.05, 0.08] });
  }

  /** The portrait as an image URL; rendered on first request, one at a time. */
  get(key: string, character: Character, kit: FighterKit, cut: PortraitCut): Promise<string> {
    const id = `${key}:${cut}`;
    const done = this.cache.get(id);
    if (done) return Promise.resolve(done);
    const job = this.queue.then(async () => {
      if (this.cache.has(id)) return this.cache.get(id)!;
      // Let the page breathe between two portraits.
      await new Promise((r) => requestAnimationFrame(r));
      const url = this.shoot(character, kit, cut);
      this.cache.set(id, url);
      return url;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** Already rendered, if so (to draw it at once). */
  ready(key: string, cut: PortraitCut): string | undefined {
    return this.cache.get(`${key}:${cut}`);
  }

  private shoot(character: Character, kit: FighterKit, cut: PortraitCut): string {
    const look = character.look ?? defaultLook(kit.archetype);
    const inst = instantiate(this.lib, look);
    const root = inst.root;
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && "envMap" in m && m.envMap === proceduralEnv.map && m.envMap) m.envMap = this.env;
    });
    // The fighting stance, a beat into it.
    const idle = inst.clips.get("Idle");
    if (idle) {
      inst.mixer.clipAction(idle).play();
      inst.mixer.setTime(idle.duration * 0.3);
    }
    // Three-quarter view, the body turned a little toward the camera's left.
    root.rotation.y = -0.38;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    this.rim.color.set(character.colors.primary);
    const [w, ht] = SIZE[cut];
    // The whole figure, from slightly below (heroic), in a wide frame; it is then cut to
    // its silhouette (see fit), or to the top of it for a bust (head and shoulders,
    // whatever the proportions: a big-headed Sonic as well as a tall Batman).
    const [fw, fh] = SIZE.full;
    this.renderer.setSize(fw * 2, fh * 2, false);
    const cam = new THREE.PerspectiveCamera(26, fw / fh, 0.05, 50);
    const dist = 1.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(dist * 0.15, 0.85, dist);
    cam.lookAt(0, 1.0, 0);
    // A few frames, so the cloth and hair (moved as they are drawn) settle where they hang.
    for (let i = 0; i < 3; i++) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      this.outline.render(this.scene, cam);
    }
    const url = fit(this.renderer.domElement, w, ht, cut === "bust" ? 0.42 : 1);
    this.scene.remove(root);
    return url;
  }
}

/**
 * Cuts a rendered figure to its silhouette: the opaque pixels' extent sets the scale
 * (the figure fills the height, feet at the bottom), and their densest column the
 * centre, so a staff or a sword held out does not push the body aside.
 */
function fit(src: HTMLCanvasElement, w: number, h: number, band = 1): string {
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  const g = tmp.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const { data } = g.getImageData(0, 0, tmp.width, tmp.height);
  let top = tmp.height;
  let bottom = -1;
  const cols = new Float64Array(tmp.width);
  for (let y = 0; y < tmp.height; y++)
    for (let x = 0; x < tmp.width; x++)
      if (data[(y * tmp.width + x) * 4 + 3]! > 24) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        cols[x]! += 1;
      }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  if (bottom < 0) return out.toDataURL("image/png");
  // Weighted centre of the columns (the body has far more pixels than a blade).
  let sum = 0;
  let mass = 0;
  cols.forEach((n, x) => {
    const k = n * n;
    sum += x * k;
    mass += k;
  });
  const cx = sum / mass;
  const o = out.getContext("2d")!;
  if (band < 1) {
    // A bust: the top `band` of the figure, centred on the head (the densest columns
    // of that top part), a little headroom above.
    const span = (bottom - top + 1) * band;
    let hs = 0;
    let hm = 0;
    for (let y = top; y < top + span; y++)
      for (let x = 0; x < tmp.width; x++)
        if (data[(y * tmp.width + x) * 4 + 3]! > 24) {
          hs += x;
          hm += 1;
        }
    const hx = hm ? hs / hm : cx;
    const side = span * 1.08;
    const k2 = h / side;
    o.drawImage(tmp, 0, 0, tmp.width, tmp.height, w / 2 - hx * k2, (top - side * 0.06) * -k2, tmp.width * k2, tmp.height * k2);
    return out.toDataURL("image/png");
  }
  const k = (h * 0.96) / (bottom - top + 1);
  o.drawImage(tmp, 0, 0, tmp.width, tmp.height, w / 2 - cx * k, h - (bottom + 1) * k, tmp.width * k, tmp.height * k);
  return out.toDataURL("image/png");
}
