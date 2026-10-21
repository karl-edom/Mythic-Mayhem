// The game's sounds, made by the browser's audio engine (Web Audio) at the moment they
// play: no sound file, no dependency. Each sound is a few layers of noise and tones,
// filtered and shaped (a crack and a thump for a blow, a filtered sweep of noise for a
// swing, a falling rumble for an explosion), pitched a little differently every time so
// that a flurry of blows does not sound like one sample repeated. A shared reverb gives
// the big ones a tail; a compressor keeps the sum from clipping.
//
// Browsers only let a page make sound after the player has touched it: the engine is
// started on the first key, click or gamepad press, and stays silent before that.

type Wave = OscillatorType;

/** A sound that lasts as long as something does (an energy charge), stopped by the caller. */
export interface HeldSound {
  stop(): void;
}

const VOLUME_KEY = "mythic-mayhem.volume";

export class SoundEngine {
  private ctx: BaseAudioContext | null = null;
  /** When set, sounds play at this time on the context's clock (offline rendering). */
  startAt: number | null = null;
  private master!: GainNode;
  private reverb!: GainNode;
  private noise!: AudioBuffer;
  private _volume = 0.8;

  constructor() {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v)) this._volume = Math.min(1, Math.max(0, v));
    } catch {
      // Private window, blocked storage: the default volume stays.
    }
  }

  /** Starts the engine (call from a user gesture). Harmless to call again. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.attach(new Ctx());
  }

  /** Builds the engine on a context (the page's, or an offline one to render a recording). */
  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this._volume;
    this.master.connect(comp).connect(ctx.destination);
    // White noise, two seconds, read from a random place each time.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Reverb: a stereo impulse of decaying noise (a stone street between wooden walls).
    const conv = ctx.createConvolver();
    const len = Math.round(ctx.sampleRate * 1.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    conv.buffer = ir;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.32;
    this.reverb.connect(conv).connect(this.master);
  }

  get volume(): number {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.min(1, Math.max(0, v));
    if (this.ctx) this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem(VOLUME_KEY, String(this._volume));
    } catch {
      // Not remembered: fine.
    }
  }

  // ---- Building blocks -------------------------------------------------------------

  /** The output of one sound: panned (-1 left … 1 right), with some of it sent to the reverb. */
  private out(pan: number, wet: number): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || (ctx.state !== "running" && this.startAt === null) || this._volume <= 0) return null;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.reverb);
    }
    return g;
  }

  /** A gain envelope: rises to `peak` in `attack`, dies away over `decay` (seconds from `t`). */
  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Filtered noise, its filter frequency gliding from `f0` to `f1`. */
  private noiseBurst(dest: AudioNode, t: number, o: { type: BiquadFilterType; f0: number; f1?: number; q?: number; peak: number; attack?: number; decay: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.attack ?? 0.005) + o.decay);
    const e = this.env(t, o.peak, o.attack ?? 0.005, o.decay);
    src.connect(f).connect(e).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + (o.attack ?? 0.005) + o.decay + 0.05);
  }

  /** A tone gliding from `f0` to `f1`. */
  private tone(dest: AudioNode, t: number, o: { wave: Wave; f0: number; f1?: number; peak: number; attack?: number; decay: number; glide?: number }): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.wave;
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? (o.attack ?? 0.005) + o.decay));
    const e = this.env(t, o.peak, o.attack ?? 0.005, o.decay);
    osc.connect(e).connect(dest);
    osc.start(t);
    osc.stop(t + (o.attack ?? 0.005) + o.decay + 0.05);
  }

  /** A little random spread, so repeats differ. */
  private vary(x: number, amount = 0.08): number {
    return x * (1 + (Math.random() * 2 - 1) * amount);
  }

  private now(): number {
    return this.startAt ?? this.ctx!.currentTime + 0.005;
  }

  // ---- The sounds ------------------------------------------------------------------

  /** A blow landing: a crack and a thump, heavier with `power` (0 light … 1 huge). */
  hit(power: number, pan = 0): void {
    const o = this.out(pan, 0.12 + 0.3 * power);
    if (!o) return;
    const t = this.now();
    const p = Math.min(1, Math.max(0, power));
    this.noiseBurst(o, t, { type: "bandpass", f0: this.vary(2600 - 900 * p), q: 0.7, peak: 0.55 + 0.35 * p, attack: 0.002, decay: 0.05 + 0.06 * p });
    this.tone(o, t, { wave: "sine", f0: this.vary(190 - 50 * p), f1: 45, peak: 0.85, attack: 0.003, decay: 0.14 + 0.2 * p });
    if (p > 0.45) this.noiseBurst(o, t, { type: "lowpass", f0: 1100, f1: 160, peak: 0.6 * p, attack: 0.004, decay: 0.25 + 0.3 * p });
  }

  /** A swing through the air: a sweep of noise, higher and thinner for a blade. */
  swing(weight: number, blade: boolean, pan = 0): void {
    const o = this.out(pan, 0.05);
    if (!o) return;
    const t = this.now();
    const d = 0.11 + 0.12 * weight;
    this.noiseBurst(o, t, { type: "bandpass", f0: this.vary(blade ? 1400 : 600), f1: this.vary(blade ? 5200 : 2200), q: blade ? 2.2 : 1.3, peak: 1.0 + 0.6 * weight, attack: d * 0.45, decay: d * 0.6 });
  }

  /** A blow stopped by the guard: a ring of metal over a dull knock. */
  block(pan = 0): void {
    const o = this.out(pan, 0.2);
    if (!o) return;
    const t = this.now();
    const base = this.vary(1150, 0.05);
    for (const [k, dec, pk] of [[1, 0.28, 0.22], [1.51, 0.2, 0.14], [2.11, 0.13, 0.1]] as const) this.tone(o, t, { wave: "sine", f0: base * k, peak: pk, attack: 0.002, decay: dec });
    this.noiseBurst(o, t, { type: "highpass", f0: 3000, peak: 0.3, attack: 0.001, decay: 0.03 });
    this.tone(o, t, { wave: "sine", f0: 140, f1: 70, peak: 0.4, decay: 0.08 });
  }

  /** The guard shatters: glass breaking and a falling tone. */
  guardBreak(pan = 0): void {
    const o = this.out(pan, 0.4);
    if (!o) return;
    const t = this.now();
    this.noiseBurst(o, t, { type: "highpass", f0: 2500, peak: 0.5, attack: 0.002, decay: 0.45 });
    this.tone(o, t, { wave: "triangle", f0: 900, f1: 160, peak: 0.35, decay: 0.5 });
    this.hit(0.7, pan);
  }

  /** An explosion: a falling rumble of noise and a deep boom, with a long tail. */
  explosion(size: number, pan = 0): void {
    const o = this.out(pan, 0.45);
    if (!o) return;
    const t = this.now();
    const s = Math.min(1.5, Math.max(0.3, size));
    this.noiseBurst(o, t, { type: "lowpass", f0: this.vary(2800), f1: 120, q: 0.5, peak: 0.9, attack: 0.004, decay: 0.7 + 0.4 * s });
    this.tone(o, t, { wave: "sine", f0: this.vary(75), f1: 28, peak: 1, attack: 0.004, decay: 0.6 + 0.3 * s });
    this.noiseBurst(o, t, { type: "bandpass", f0: 1800, q: 0.6, peak: 0.5, attack: 0.001, decay: 0.06 });
  }

  /** Fire roaring out (a fireball, flames): a breath of noise and crackles. */
  fire(pan = 0): void {
    const o = this.out(pan, 0.2);
    if (!o) return;
    const t = this.now();
    this.noiseBurst(o, t, { type: "lowpass", f0: 600, f1: 1800, q: 0.7, peak: 0.9, attack: 0.06, decay: 0.55 });
    for (let i = 0; i < 14; i++) this.noiseBurst(o, t + Math.random() * 0.6, { type: "highpass", f0: 3000 + Math.random() * 3000, peak: 0.2 + Math.random() * 0.2, attack: 0.001, decay: 0.012 });
  }

  /** Electricity: a buzzing saw chopped at random, and sharp crackles. */
  zap(duration = 0.45, pan = 0): void {
    const o = this.out(pan, 0.15);
    if (!o) return;
    const ctx = this.ctx!;
    const t = this.now();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = this.vary(95);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    for (let k = 0; k < duration; k += 0.018) g.gain.setValueAtTime(Math.random() < 0.6 ? 0.25 * Math.random() + 0.08 : 0.0001, t + k);
    g.gain.setValueAtTime(0.0001, t + duration);
    osc.connect(bp).connect(g).connect(o);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    for (let i = 0; i < 18; i++) this.noiseBurst(o, t + Math.random() * duration, { type: "highpass", f0: 4000, peak: 0.25 * Math.random() + 0.1, attack: 0.001, decay: 0.01 });
  }

  /** An energy beam fired (Kamehameha, lasers): a rising roar held a moment. */
  beam(pan = 0): void {
    const o = this.out(pan, 0.3);
    if (!o) return;
    const t = this.now();
    this.tone(o, t, { wave: "sawtooth", f0: 180, f1: 420, peak: 0.2, attack: 0.08, decay: 0.9, glide: 0.4 });
    this.tone(o, t, { wave: "sine", f0: 880, f1: 1320, peak: 0.18, attack: 0.05, decay: 0.8, glide: 0.4 });
    this.noiseBurst(o, t, { type: "bandpass", f0: 900, f1: 2400, q: 0.8, peak: 0.9, attack: 0.08, decay: 0.9 });
  }

  /** A ball of energy launched (ki, aura, a plain shot of light): a bright whoosh with a shimmer. */
  energy(pan = 0): void {
    const o = this.out(pan, 0.25);
    if (!o) return;
    const t = this.now();
    this.tone(o, t, { wave: "triangle", f0: this.vary(520), f1: 1040, peak: 0.18, attack: 0.01, decay: 0.3 });
    this.tone(o, t, { wave: "sine", f0: this.vary(1560), f1: 2080, peak: 0.08, attack: 0.01, decay: 0.35 });
    this.noiseBurst(o, t, { type: "bandpass", f0: 800, f1: 3000, q: 1.2, peak: 0.8, attack: 0.03, decay: 0.25 });
  }

  /** A gunshot (bullets): a sharp crack and a short thump. */
  shot(pan = 0): void {
    const o = this.out(pan, 0.25);
    if (!o) return;
    const t = this.now();
    this.noiseBurst(o, t, { type: "highpass", f0: 900, peak: 0.6, attack: 0.001, decay: 0.07 });
    this.tone(o, t, { wave: "sine", f0: 140, f1: 50, peak: 0.6, decay: 0.09 });
  }

  /** Something thrown or launched without power of its own (a sai, a pizza, a rocket leaving). */
  throwSound(pan = 0): void {
    this.swing(0.6, false, pan);
  }

  /** A rocket's ignition and hiss. */
  rocket(pan = 0): void {
    const o = this.out(pan, 0.2);
    if (!o) return;
    const t = this.now();
    this.noiseBurst(o, t, { type: "bandpass", f0: 500, f1: 1600, q: 0.7, peak: 0.8, attack: 0.03, decay: 0.7 });
    this.tone(o, t, { wave: "sine", f0: 110, f1: 60, peak: 0.4, decay: 0.15 });
  }

  /** Wind (a tornado, a whirl): a long rising and falling sweep. */
  wind(pan = 0): void {
    const o = this.out(pan, 0.2);
    if (!o) return;
    const t = this.now();
    this.noiseBurst(o, t, { type: "bandpass", f0: 400, f1: 1600, q: 2.5, peak: 1.6, attack: 0.2, decay: 0.6 });
  }

  /** A special starting: a short rising chime, a hint of what is coming. */
  windup(pan = 0): void {
    const o = this.out(pan, 0.3);
    if (!o) return;
    const t = this.now();
    this.tone(o, t, { wave: "triangle", f0: 660, f1: 1320, peak: 0.25, attack: 0.02, decay: 0.22, glide: 0.18 });
  }

  /** A counter or a parry: a clear bell. */
  bell(pan = 0): void {
    const o = this.out(pan, 0.5);
    if (!o) return;
    const t = this.now();
    this.tone(o, t, { wave: "sine", f0: 1320, peak: 0.35, attack: 0.002, decay: 0.7 });
    this.tone(o, t, { wave: "sine", f0: 1980, peak: 0.12, attack: 0.002, decay: 0.45 });
    this.swing(0.4, true, pan);
  }

  /** A puff of smoke (substitution, clones). */
  poof(pan = 0): void {
    const o = this.out(pan, 0.2);
    if (!o) return;
    this.noiseBurst(o, this.now(), { type: "lowpass", f0: 1400, f1: 300, peak: 1.1, attack: 0.01, decay: 0.35 });
  }

  /** A dodge or a dash: a quick high whoosh. */
  dash(pan = 0): void {
    const o = this.out(pan, 0.05);
    if (!o) return;
    this.noiseBurst(o, this.now(), { type: "bandpass", f0: 1200, f1: 3800, q: 1.4, peak: 0.8, attack: 0.04, decay: 0.12 });
  }

  /** A jump: a soft whoosh going up. */
  jump(pan = 0): void {
    const o = this.out(pan, 0);
    if (!o) return;
    this.noiseBurst(o, this.now(), { type: "bandpass", f0: 700, f1: 1800, q: 1.2, peak: 0.6, attack: 0.03, decay: 0.1 });
  }

  /** Landing: a low thud and a scuff. */
  land(pan = 0): void {
    const o = this.out(pan, 0.05);
    if (!o) return;
    const t = this.now();
    this.tone(o, t, { wave: "sine", f0: 95, f1: 45, peak: 0.35, decay: 0.09 });
    this.noiseBurst(o, t, { type: "lowpass", f0: 500, peak: 0.15, attack: 0.003, decay: 0.07 });
  }

  /** Wood or crates breaking. */
  crash(pan = 0): void {
    const o = this.out(pan, 0.25);
    if (!o) return;
    const t = this.now();
    this.noiseBurst(o, t, { type: "bandpass", f0: 900, q: 0.6, peak: 1.0, attack: 0.002, decay: 0.25 });
    for (let i = 0; i < 6; i++) this.tone(o, t + Math.random() * 0.15, { wave: "triangle", f0: this.vary(300, 0.4), f1: 120, peak: 0.12, decay: 0.08 });
  }

  /** A K.-O.: a huge blow, the boom, a long falling tone. */
  ko(pan = 0): void {
    this.hit(0.8, pan);
    this.explosion(0.45, pan);
    const o = this.out(pan, 0.6);
    if (!o) return;
    this.tone(o, this.now(), { wave: "triangle", f0: 700, f1: 70, peak: 0.25, attack: 0.01, decay: 1.1 });
  }

  /** The gong that opens a fight. */
  gong(): void {
    const o = this.out(0, 0.6);
    if (!o) return;
    const t = this.now();
    for (const [f, pk, d] of [[98, 0.5, 2.2], [196, 0.25, 1.6], [293, 0.12, 1.2], [415, 0.08, 0.9]] as const) this.tone(o, t, { wave: "sine", f0: f, f1: f * 0.98, peak: pk, attack: 0.004, decay: d });
    this.noiseBurst(o, t, { type: "lowpass", f0: 900, peak: 0.4, attack: 0.002, decay: 0.15 });
  }

  /** Fight over: three rising notes. */
  fanfare(): void {
    const o = this.out(0, 0.4);
    if (!o) return;
    const t = this.now();
    [523, 659, 784, 1047].forEach((f, i) => this.tone(o, t + i * 0.12, { wave: "triangle", f0: f, peak: 0.35, attack: 0.01, decay: i === 3 ? 0.9 : 0.2 }));
  }

  /** Menus: a light tick when pointing, a two-note chime when choosing. */
  tick(): void {
    const o = this.out(0, 0);
    if (!o) return;
    this.tone(o, this.now(), { wave: "sine", f0: 1500, peak: 0.12, attack: 0.001, decay: 0.03 });
  }
  confirm(): void {
    const o = this.out(0, 0.15);
    if (!o) return;
    const t = this.now();
    this.tone(o, t, { wave: "triangle", f0: 660, peak: 0.25, attack: 0.003, decay: 0.08 });
    this.tone(o, t + 0.07, { wave: "triangle", f0: 990, peak: 0.25, attack: 0.003, decay: 0.16 });
  }

  /** Charging energy: a hum that swells as long as it lasts. */
  charge(pan = 0): HeldSound {
    const o = this.out(pan, 0.2);
    if (!o) return { stop() {} };
    const ctx = this.ctx!;
    const t = this.now();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.25);
    const oscs = [110, 111.5, 220.7].map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? "triangle" : "sawtooth";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.6, t + 2.5);
      return osc;
    });
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 2.5);
    for (const osc of oscs) {
      osc.connect(lp);
      osc.start(t);
    }
    lp.connect(g).connect(o);
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        const e = ctx.currentTime;
        g.gain.cancelScheduledValues(e);
        g.gain.setValueAtTime(g.gain.value, e);
        g.gain.exponentialRampToValueAtTime(0.0001, e + 0.15);
        for (const osc of oscs) osc.stop(e + 0.2);
      },
    };
  }
}

/** The one sound engine of the page. */
export const sound = new SoundEngine();
