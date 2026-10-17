// Model showcase (dev tool): one fighter model on a studio backdrop, playing a clip,
// turning slowly. URL: vitrine.html?model=turtle&show=Sai,Sai_Offhand&outfit=%23d01c1c&clip=Idle
// Driven from the console or a test script through window.__vitrine.

import * as THREE from "three";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Look, ModelId } from "../brawl/character.ts";
import { instantiate, loadModels, proceduralEnv } from "./models.ts";
import { setWrist } from "./poses.ts";

const q = new URLSearchParams(location.search);
const look: Look = {
  model: (q.get("model") ?? "turtle") as ModelId,
  show: (q.get("show") ?? "Sai,Sai_Offhand").split(",").filter(Boolean),
  tint: "#ffffff",
  outfit: q.get("outfit") ?? "#d01c1c",
  ...(q.get("hair") ? { hair: q.get("hair")! } : {}),
};

if (q.get("wrist")) setWrist(Number(q.get("wrist")));
const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#d9d9dc");
proceduralEnv.map = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = proceduralEnv.map;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a90, 1.2));
const key = new THREE.DirectionalLight(0xfff2e2, 2.6);
key.position.set(2.5, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xdbe8ff, 1.6);
rim.position.set(-3, 2.5, -3);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: 0.25 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0.08, 0.06, 0.1] });

const state = { yaw: 0.5, spin: 0.25, clip: q.get("clip") ?? "Idle", dist: 4.2, height: 1.0 };
let mixer: THREE.AnimationMixer | null = null;
let clips = new Map<string, THREE.AnimationClip>();
let root: THREE.Object3D | null = null;

function play(name: string, t?: number): void {
  if (!mixer) return;
  const c = clips.get(name);
  if (!c) return;
  state.clip = name;
  mixer.stopAllAction();
  const a = mixer.clipAction(c);
  a.reset().play();
  if (t !== undefined) {
    a.paused = true;
    a.time = t * c.duration;
  }
}

(window as unknown as { __vitrine: unknown }).__vitrine = {
  state,
  play,
  clips: () => [...clips.keys()],
  info: (name: string) => {
    const c = clips.get(name);
    return c ? { duration: c.duration, naturalSpeed: c.userData.naturalSpeed } : null;
  },
  ready: false,
};

loadModels(new URL("models/", document.baseURI).href).then((lib) => {
  const inst = instantiate(lib, look);
  root = inst.root;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  scene.add(root);
  mixer = inst.mixer;
  clips = inst.clips;
  play(state.clip);
  (window as unknown as { __vitrine: { ready: boolean } }).__vitrine.ready = true;
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  state.yaw += state.spin * dt;
  camera.position.set(Math.sin(state.yaw) * state.dist, state.height + 0.25, Math.cos(state.yaw) * state.dist);
  camera.lookAt(0, state.height, 0);
  mixer?.update(dt);
  outline.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
