// The arena's surroundings and props, in the cel-shaded style: gradient sky,
// clouds, distant mountains, painted ground, stone walls, and stylised props.
// Props keep exactly the footprint and height the simulation uses.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Arena, Prop } from "../brawl/arena.ts";
import {
  cloudTexture, dirtTexture, grassTexture, noOutline, outlineOf, pavingTexture, stoneTexture, toon, woodTexture,
} from "./toon.ts";

type Theme = "meadow" | "village";

function themeOf(arena: Arena): Theme {
  return arena.def.id.includes("village") ? "village" : "meadow";
}

/** Seeded random so the scenery is the same every match on a map. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

const tex = {
  wood: null as THREE.Texture | null,
  stone: null as THREE.Texture | null,
};
const wood = () => (tex.wood ??= woodTexture());
const stone = () => (tex.stone ??= stoneTexture());

/** Toon material with a texture repeated to the given size in metres. */
function textured(color: THREE.ColorRepresentation, map: THREE.Texture, sx = 1, sy = 1): THREE.MeshToonMaterial {
  const t = map.clone();
  t.needsUpdate = true;
  t.repeat.set(sx, sy);
  return toon(color, t);
}

export function buildProp(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const w = p.halfW * 2;
  const d = p.halfD * 2;
  const h = p.height;
  const add = (m: THREE.Mesh, y: number) => {
    m.position.y = y;
    g.add(m);
    return m;
  };

  if (p.rise) {
    const run = p.rise.axis === "x" ? w : d;
    const across = p.rise.axis === "x" ? d : w;
    const body = new THREE.Group();
    if (p.kind.look === "stairs") {
      const n = Math.max(2, Math.round(h / 0.3));
      for (let i = 0; i < n; i++) {
        const sh = (h * (i + 1)) / n;
        const step = mesh(new THREE.BoxGeometry(run / n, sh, across), textured(0xffffff, wood(), 1, sh));
        step.position.set(-run / 2 + (run / n) * (i + 0.5), sh / 2, 0);
        body.add(step);
      }
    } else {
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(run, h)]);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: across, bevelEnabled: false });
      geo.translate(-run / 2, 0, -across / 2);
      body.add(mesh(geo, textured(0xffffff, stone(), 0.4, 0.4)));
    }
    body.rotation.y = p.rise.axis === "x" ? (p.rise.sign > 0 ? 0 : Math.PI) : p.rise.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(body);
    return g;
  }

  switch (p.kind.look) {
    case "tree": {
      const trunk = add(mesh(new THREE.CylinderGeometry(p.halfW * 0.55, p.halfW * 0.85, h * 0.5, 8), toon(0x8a5a36)), h * 0.25);
      trunk.rotation.y = 0.3;
      const r = rand(Math.round(p.x * 13 + p.z * 7));
      const leaf = toon(p.kind.color);
      const leafDark = toon(new THREE.Color(p.kind.color).multiplyScalar(0.8));
      for (let i = 0; i < 5; i++) {
        const blob = mesh(new THREE.IcosahedronGeometry(p.halfW * (1.6 + r() * 0.8), 1), i % 2 ? leaf : leafDark);
        const a = (i / 5) * Math.PI * 2;
        blob.position.set(Math.cos(a) * p.halfW * 1.2, h * (0.62 + r() * 0.2), Math.sin(a) * p.halfW * 1.2);
        g.add(blob);
      }
      add(mesh(new THREE.IcosahedronGeometry(p.halfW * 2.1, 1), leaf), h * 0.85);
      break;
    }
    case "rock": {
      const r = add(mesh(new THREE.DodecahedronGeometry(1, 0), textured(0xe6e2da, stone(), 0.6, 0.6)), h / 2);
      r.scale.set(w / 2, h / 2, d / 2);
      r.rotation.y = p.x * 0.7;
      break;
    }
    case "house": {
      const wallH = h * 0.6;
      add(mesh(new THREE.BoxGeometry(w, wallH, d), toon(0xf6ead2)), wallH / 2);
      // Timber frame: corner posts and a beam under the roof.
      const beam = toon(0x7a4a2a);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const post = mesh(new THREE.BoxGeometry(0.25, wallH, 0.25), beam);
        post.position.set((x * w) / 2, wallH / 2, (z * d) / 2);
        g.add(post);
      }
      add(mesh(new THREE.BoxGeometry(w + 0.1, 0.22, d + 0.1), beam), wallH - 0.1);
      // Door and windows on the long sides.
      const door = mesh(new THREE.BoxGeometry(1, 1.8, 0.1), beam, false);
      door.position.set(0, 0.9, d / 2 + 0.03);
      g.add(door);
      const glass = toon(0x8fd3ff);
      for (const side of [-1, 1])
        for (const x of [-w / 3, w / 3]) {
          const win = mesh(new THREE.BoxGeometry(0.9, 0.8, 0.08), glass, false);
          win.position.set(x, wallH * 0.6, (side * d) / 2 + side * 0.03);
          g.add(win);
        }
      // Gable roof, overhanging.
      const roofH = h - wallH;
      const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.5, 0), new THREE.Vector2(d / 2 + 0.5, 0), new THREE.Vector2(0, roofH)]);
      const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: w + 0.6, bevelEnabled: false });
      roofGeo.translate(0, 0, -(w + 0.6) / 2);
      const roof = mesh(roofGeo, toon(0xd2553f));
      roof.rotation.y = Math.PI / 2;
      roof.position.y = wallH;
      g.add(roof);
      break;
    }
    case "crate": {
      add(mesh(new THREE.BoxGeometry(w, h, d), textured(0xffffff, wood())), h / 2);
      const frame = toon(0x7a4a22);
      for (const y of [0.06, h - 0.06]) add(mesh(new THREE.BoxGeometry(w + 0.04, 0.12, d + 0.04), frame, false), y);
      break;
    }
    case "barrel": {
      const pts = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return new THREE.Vector2(p.halfW * (0.82 + 0.18 * Math.sin(t * Math.PI)), t * h);
      });
      add(mesh(new THREE.LatheGeometry(pts, 16), textured(0xd9a070, wood(), 2, 1)), 0);
      const band = toon(0x55504a);
      for (const y of [0.18, h - 0.18]) add(mesh(new THREE.CylinderGeometry(p.halfW * 0.92, p.halfW * 0.92, 0.07, 16, 1, true), band, false), y);
      break;
    }
    case "fence": {
      const m = toon(p.kind.color);
      const long = Math.max(w, d);
      const n = Math.max(2, Math.round(long / 1));
      for (let i = 0; i <= n; i++) {
        const post = mesh(new THREE.BoxGeometry(0.14, h, 0.14), m);
        const along = -long / 2 + (long * i) / n;
        post.position.set(w > d ? along : 0, h / 2, w > d ? 0 : along);
        g.add(post);
      }
      for (const y of [h * 0.35, h * 0.78]) add(mesh(new THREE.BoxGeometry(w > d ? long : 0.08, 0.12, w > d ? 0.08 : long), m), y);
      break;
    }
    case "pillar": {
      const m = textured(0xffffff, stone(), 1, 2);
      add(mesh(new THREE.CylinderGeometry(p.halfW * 0.8, p.halfW * 0.8, h - 0.6, 12), m), h / 2);
      add(mesh(new THREE.BoxGeometry(w, 0.3, d), m), 0.15);
      add(mesh(new THREE.BoxGeometry(w * 1.05, 0.3, d * 1.05), m), h - 0.15);
      break;
    }
    case "wall": {
      const m = textured(0xffffff, stone(), Math.max(w, d) / 2, h / 2);
      add(mesh(new THREE.BoxGeometry(w, h - 0.3, d), m), (h - 0.3) / 2);
      // Crenellations.
      const long = Math.max(w, d);
      const n = Math.max(2, Math.floor(long / 1.2));
      for (let i = 0; i < n; i++) {
        const c = mesh(new THREE.BoxGeometry(w > d ? 0.6 : d, 0.3, w > d ? d : 0.6), m);
        const along = -long / 2 + 0.3 + ((long - 0.6) * i) / (n - 1);
        c.position.set(w > d ? along : 0, h - 0.15, w > d ? 0 : along);
        g.add(c);
      }
      break;
    }
    case "platform": {
      add(mesh(new THREE.BoxGeometry(w, h, d), textured(0xffffff, stone(), w / 2, h / 2)), h / 2);
      add(mesh(new THREE.BoxGeometry(w + 0.15, 0.2, d + 0.15), toon(0xefe6cf), false), h - 0.1);
      break;
    }
    case "terrace":
    case "tower": {
      add(mesh(new THREE.BoxGeometry(w, h, d), textured(0xffffff, wood(), w / 1.5, h / 1.5)), h / 2);
      add(mesh(new THREE.BoxGeometry(w + 0.2, 0.18, d + 0.2), toon(0x8a5a32), false), h - 0.09);
      // Corner posts and cross bands: reads as a built structure, not a block.
      const beam = toon(0x7a4a2a);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const post = mesh(new THREE.BoxGeometry(0.3, h, 0.3), beam);
        post.position.set((x * w) / 2, h / 2, (z * d) / 2);
        g.add(post);
      }
      for (let y = 1.2; y < h - 0.4; y += 1.2) add(mesh(new THREE.BoxGeometry(w + 0.06, 0.16, d + 0.06), beam, false), y);
      break;
    }
    default:
      add(
        mesh(
          p.kind.shape.type === "cylinder" ? new THREE.CylinderGeometry(p.halfW, p.halfW, h, 16) : new THREE.BoxGeometry(w, h, d),
          toon(p.kind.color),
        ),
        h / 2,
      );
  }
  return g;
}

/** Sky dome with a vertical gradient, drawn behind everything. */
function sky(radius: number): THREE.Mesh {
  const mat = noOutline(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x3f8be0) }, horizon: { value: new THREE.Color(0xd8efff) } },
      vertexShader: "varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }",
    }),
  );
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
}

export interface Environment {
  /** One object per arena prop, same order as arena.props. */
  props: THREE.Object3D[];
  sun: THREE.DirectionalLight;
}

export function buildEnvironment(scene: THREE.Scene, arena: Arena): Environment {
  const { halfW, halfD } = arena;
  const span = Math.max(halfW, halfD);
  const theme = themeOf(arena);
  const r = rand(theme === "village" ? 99 : 42);
  const horizon = new THREE.Color(0xd8efff);
  scene.background = horizon;
  scene.fog = new THREE.Fog(horizon, span * 2.2, span * 6);
  scene.add(sky(span * 8));

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x8d7a58, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(span * 0.7, span * 1.5, span * 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.06;
  Object.assign(sun.shadow.camera, { left: -span - 4, right: span + 4, top: span + 4, bottom: -span - 4, far: span * 5 });
  scene.add(sun);

  // Ground: meadow all around, the arena floor inside the walls.
  const grassMat = noOutline(toon(0xffffff, grassTexture()));
  grassMat.map!.repeat.set(span * 1.5, span * 1.5);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(span * 10, span * 10), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.03;
  grass.receiveShadow = true;
  scene.add(grass);
  const floorTex = theme === "village" ? pavingTexture() : dirtTexture();
  floorTex.repeat.set(halfW / 3, halfD / 3);
  const floorMat = noOutline(toon(theme === "village" ? 0xffffff : 0xfff6e0, floorTex));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  if (theme === "meadow") {
    // Meadow arena: grass over most of the floor, a worn dirt ring in the middle.
    const inner = noOutline(toon(0xffffff, grassTexture("#9bd874")));
    inner.map!.repeat.set(halfW / 2, halfD / 2);
    inner.transparent = true;
    inner.alphaMap = radialMask();
    const g = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), inner);
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.005;
    g.receiveShadow = true;
    scene.add(g);
  }

  // Boundary: stone walls with crenellations on the four sides.
  const wallMat = textured(0xd9d0bc, stone(), 1, 0.6);
  outlineOf(wallMat, 0.003);
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const wall = mesh(new THREE.BoxGeometry(len, 1.2, 0.8), wallMat);
    (wall.material as THREE.MeshToonMaterial).map!.repeat.set(len / 2, 0.6);
    wall.position.set((x0 + x1) / 2, 0.6, (z0 + z1) / 2);
    wall.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    scene.add(wall);
    const n = Math.floor(len / 1.6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const c = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.8), wallMat);
      c.position.set(x0 + (x1 - x0) * t, 1.4, z0 + (z1 - z0) * t);
      c.rotation.y = wall.rotation.y;
      scene.add(c);
    }
  };
  const o = 0.4;
  edge(-halfW - o, -halfD - o, halfW + o, -halfD - o);
  edge(halfW + o, -halfD - o, halfW + o, halfD + o);
  edge(halfW + o, halfD + o, -halfW - o, halfD + o);
  edge(-halfW - o, halfD + o, -halfW - o, -halfD - o);

  // Scenery outside the walls: forest edge, distant mountains, clouds.
  const leaf = toon(0x4fa64a);
  const leafDark = toon(0x3e8c3f);
  const trunk = toon(0x7d5132);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const dist = 1.25 + r() * 0.9;
    const x = Math.cos(a) * (halfW + 4) * dist;
    const z = Math.sin(a) * (halfD + 4) * dist;
    if (Math.abs(x) < halfW + 3 && Math.abs(z) < halfD + 3) continue;
    const s = 1 + r() * 1.2;
    const t = mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2 * s, 6), trunk);
    t.position.set(x, s, z);
    scene.add(t);
    const c = mesh(new THREE.ConeGeometry(1.5 * s, 3.5 * s, 7), r() < 0.5 ? leaf : leafDark);
    c.position.set(x, 2 * s + 1.5 * s, z);
    scene.add(c);
  }
  const mountain = [toon(0x7aa0c8), toon(0x8fb3d6), toon(0x6d93bd)];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + r() * 0.2;
    const dist = span * (4 + r() * 1.5);
    const hgt = span * (0.9 + r() * 0.9);
    const m = new THREE.Mesh(new THREE.ConeGeometry(span * (1 + r() * 0.8), hgt, 6), mountain[i % 3]!);
    m.position.set(Math.cos(a) * dist, hgt / 2 - 2, Math.sin(a) * dist);
    noOutline(m.material as THREE.Material);
    scene.add(m);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(span * 0.3, hgt * 0.25, 6), noOutline(toon(0xffffff)));
    snow.position.set(m.position.x, hgt - 2 - hgt * 0.125 + 0.01, m.position.z);
    snow.scale.setScalar(((m.geometry as THREE.ConeGeometry).parameters.radius / (span * 0.3)) * 0.26);
    scene.add(snow);
  }
  const cloud = cloudTexture();
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: cloud, transparent: true, depthWrite: false, fog: false })));
    const a = r() * Math.PI * 2;
    const dist = span * (2.5 + r() * 3);
    s.position.set(Math.cos(a) * dist, span * (1.2 + r() * 1.2), Math.sin(a) * dist);
    s.scale.set(span * (1.6 + r()), span * (0.8 + r() * 0.4), 1);
    scene.add(s);
  }

  // Grass tufts outside the walls, and on the meadow floor away from props (instanced: cheap).
  {
    const blades = [-0.5, 0, 0.5].map((tilt, i) => {
      const b = new THREE.ConeGeometry(0.05, 0.38, 3);
      b.translate(0, 0.19, 0);
      b.rotateZ(tilt * 0.5);
      b.rotateY((i * Math.PI * 2) / 3);
      return b;
    });
    const tuft = mergeGeometries(blades);
    const n = 900;
    const inst = new THREE.InstancedMesh(tuft, noOutline(toon(0x5fae4c)), n);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const x = (r() * 2 - 1) * span * 2.5;
      const z = (r() * 2 - 1) * span * 2.5;
      const inside = Math.abs(x) < halfW && Math.abs(z) < halfD;
      if (inside && (theme === "village" || arena.props.some((p) => Math.abs(p.x - x) < p.halfW + 0.3 && Math.abs(p.z - z) < p.halfD + 0.3))) continue;
      if (inside && Math.hypot(x / halfW, z / halfD) < 0.75) continue;
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, (r() - 0.5) * 0.5)), new THREE.Vector3(1, 0.7 + r() * 0.8, 1));
      inst.setMatrixAt(k++, m4);
    }
    inst.count = k;
    inst.receiveShadow = true;
    scene.add(inst);
  }

  const props = arena.props.map((p) => {
    const obj = buildProp(p);
    obj.position.set(p.x, 0, p.z);
    obj.userData.prop = p.id;
    scene.add(obj);
    return obj;
  });
  // Outlines on everything solid; props carry their own materials.
  for (const o of props)
    o.traverse((m) => {
      if (m instanceof THREE.Mesh) outlineOf(m.material as THREE.Material, 0.003);
    });
  return { props, sun };
}

/** Alpha mask: opaque at the edges, clear in a soft central circle (the worn fighting ground). */
function radialMask(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grad.addColorStop(0, "black");
  grad.addColorStop(0.45, "black");
  grad.addColorStop(0.75, "white");
  grad.addColorStop(1, "white");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
