// Energy surfaces (beams, balls of ki, auras): a material whose light comes from inside.
// Seen side on, a beam is brightest along its middle and fades to its edges (a soft
// volume, not a flat tube); energy streams along it (a scrolling noise); its colour runs
// from white-hot in the core to the technique's colour, then to a darker rim.
// Display only; no dependency, the noise is painted once.

import * as THREE from "three";

let noiseTex: THREE.DataTexture | null = null;

/** A tileable value noise, 128², several octaves: the « grain » of energy. */
export function noiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const octave = (cells: number) => {
    const grid = Array.from({ length: cells * cells }, r);
    const at = (x: number, y: number) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)]!;
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells;
        const fy = (y / N) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0));
        const sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0));
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[y * N + x] = a + (b - a) * sy;
      }
    return out;
  };
  const layers = [octave(4), octave(8), octave(16), octave(32)];
  for (let i = 0; i < N * N; i++) {
    const v = layers[0]![i]! * 0.5 + layers[1]![i]! * 0.25 + layers[2]![i]! * 0.15 + layers[3]![i]! * 0.1;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255);
    data[i * 4 + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

export interface EnergyOptions {
  /** How much the light gathers in the middle (1 soft, 4 a thin bright line). */
  core?: number;
  /** Scroll speed of the energy along the surface (UV per second), and its grain. */
  flow?: [number, number];
  grain?: [number, number];
  /** Overall brightness (the bloom picks up above ~1.6). */
  intensity?: number;
  opacity?: number;
}

/**
 * Additive energy material. Its `time` uniform must be advanced (`energyTick`), its
 * `color` is the technique's.
 */
export function energyMaterial(color: THREE.ColorRepresentation, o: EnergyOptions = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(color) },
      noise: { value: noiseTexture() },
      core: { value: o.core ?? 1.6 },
      flow: { value: new THREE.Vector2(...(o.flow ?? [0, -2.2])) },
      grain: { value: new THREE.Vector2(...(o.grain ?? [2, 1])) },
      intensity: { value: o.intensity ?? 2.2 },
      opacity: { value: o.opacity ?? 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, core, intensity, opacity;
      uniform vec3 color;
      uniform vec2 flow, grain;
      uniform sampler2D noise;
      varying vec3 vN;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        // Facing the eye = looking through the thickest part: brightest.
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float body = pow(facing, core);
        vec2 uv = vUv * grain + flow * time;
        float n = texture2D(noise, uv).r * 0.65 + texture2D(noise, uv * 2.3 - flow * time * 0.7).r * 0.35;
        float e = body * (0.55 + 0.9 * n);
        // White-hot in the core, the technique's colour around it, darker at the rim.
        vec3 hot = mix(color, vec3(1.0), smoothstep(0.55, 1.0, e));
        vec3 col = mix(color * 0.35, hot, smoothstep(0.05, 0.6, e)) * intensity;
        gl_FragColor = vec4(col * e * opacity, e * opacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.userData.hdr = true;
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** Advances an energy material's clock. */
export function energyTick(m: THREE.ShaderMaterial, t: number): void {
  m.uniforms.time!.value = t;
}
