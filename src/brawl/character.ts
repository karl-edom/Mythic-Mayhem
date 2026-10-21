// Identity layer (layer A): display only. The engine never reads it, so any
// value here is harmless; it is still sanitised before reaching the screen.

/**
 * Models built entirely in code (no file): a humanoid with a wardrobe of parts
 * (swordsman.ts, humanParts.ts, creatureParts.ts) and a turtle. The first models
 * (KayKit chibis and VRoid avatars) were retired with the first fighters (decision 0024).
 */
export const PROCEDURAL_MODELS = ["turtle", "swordsman"] as const;
/**
 * "vrm": an avatar file (VRoid and the like, VRM 0.x or 1.0) shipped in the pack itself
 * (`look.file`), animated through its humanoid bones like the models built in code.
 */
export type ModelId = (typeof PROCEDURAL_MODELS)[number] | "vrm";
const ALL_MODELS: readonly string[] = [...PROCEDURAL_MODELS, "vrm"];
/** A VRM file name in the pack folder: letters, digits, dash, underscore, dot. */
export const VRM_FILE = /^[A-Za-z0-9_.-]{1,60}\.vrm$/;

export interface Look {
  model: ModelId;
  /** model "vrm": the avatar file, next to character.json. */
  file?: string;
  /** A glow of this colour always round the body (Super Sonic's golden aura). */
  aura?: string;
  /** The main weapon's blade smoulders all the time and blazes at every blow (Shishio's Mugenjin). */
  burning?: boolean;
  /**
   * Height on screen, metres (0.8 to 2.4; default 1.8): a small Sonic beside a tall
   * Eggman. Display only: the body the simulation hits stays the same for everyone.
   */
  height?: number;
  /** Accessories to show (weapons, shields, hats…), by mesh name; all others are hidden. */
  show: string[];
  /** Colour multiplied over the model's texture ("#ffffff" = unchanged). */
  tint: string;
  /** Anime models: colour multiplied over the hair, and over the clothes. */
  hair?: string;
  outfit?: string;
  /** Models built in code: second and third cloth colours, skin, eyes. */
  accent?: string;
  trim?: string;
  skin?: string;
  eyes?: string;
  /** A sign worn on the clothes: a few letters (e.g. a kanji), or "spiral" / "fan". */
  emblem?: string;
  /** Face of models that have several (turtle): "fierce" (default), "calm", "wild". */
  expression?: "fierce" | "calm" | "wild";
}

export interface Character {
  name: string;
  universe: string;
  description: string;
  colors: { primary: string; secondary: string };
  /** Absent: the client picks a model from the fighter's archetype. */
  look?: Look;
  /** Presentation of specials, by special id: display only. */
  moves: Record<string, MoveStyle>;
}

export interface MoveStyle {
  /** The technique's name (e.g. in kanji), ≤ 8 characters. No longer shown on screen (2026-10-20): kept so packs stay valid. */
  callout?: string;
  /** Number of blade slashes drawn across the target when the special hits (0–12). */
  slashes?: number;
  /** Look of a projectile special: a ball of light (default) or one of the drawn objects. */
  projectile?: (typeof PROJECTILE_LOOKS)[number];
  /** Look of a trap or a burst: a magic circle (default), fire, an explosion, a vortex, or lightning. */
  zone?: (typeof ZONE_LOOKS)[number];
  /** What glows in the hand (or on the blade) from the start of the special to its end. */
  hand?: (typeof HAND_LOOKS)[number];
  /** Colour of the technique's light (beam, ball, aura in the hand), else the character's. */
  color?: string;
  /** A weapon taken in hand for this special only (a chainsaw, a rifle), by name; "None": bare hands. */
  weapon?: string;
  /** The technique's own animation (a swordsman's signature move), else its style's. */
  pose?: (typeof SIGNATURE_POSES)[number];
}

/** Signature animations of the specials, by name (see signaturePoses.ts). */
export const SIGNATURE_POSES = [
  "gatotsu", "gatotsu-sanshiki", "gatotsu-zeroshiki",
  "homura-dama", "guren-kaina", "kagutsuchi",
  "chidori", "katon", "sharingan",
  "leo-dragon", "leo-guard", "leo-flip",
  "kamehameha", "kaioken", "genkidama",
  "galick-ho", "big-bang", "final-flash",
  "rasengan", "kawarimi", "uzumaki-rendan",
  "spin-ball", "homing", "drill-dive",
] as const;

export const PROJECTILE_LOOKS = ["pizza", "beam", "fire", "bullet", "rocket", "tornado", "disc"] as const;
export const ZONE_LOOKS = ["fire", "blast", "vortex", "lightning"] as const;
export const HAND_LOOKS = ["ki", "orb", "lightning", "fire"] as const;

const COLOR = /^#[0-9a-fA-F]{6}$/;

const text = (v: unknown, fallback: string, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

export function parseCharacter(data: unknown, fallbackName: string): Character {
  const o = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const c = (typeof o.colors === "object" && o.colors !== null ? o.colors : {}) as Record<string, unknown>;
  return {
    name: text(o.name, fallbackName, 40),
    universe: text(o.universe, "Inconnu", 60),
    description: text(o.description, "", 200),
    colors: {
      primary: typeof c.primary === "string" && COLOR.test(c.primary) ? c.primary : "#888888",
      secondary: typeof c.secondary === "string" && COLOR.test(c.secondary) ? c.secondary : "#dddddd",
    },
    look: parseLook(o.look),
    moves: parseMoves(o.moves),
  };
}

function parseMoves(v: unknown): Record<string, MoveStyle> {
  const out: Record<string, MoveStyle> = {};
  if (typeof v !== "object" || v === null) return out;
  for (const [id, m] of Object.entries(v as Record<string, unknown>).slice(0, 8)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || typeof m !== "object" || m === null) continue;
    const o = m as Record<string, unknown>;
    const style: MoveStyle = {};
    // Letters only (any script), no markup or control characters.
    if (typeof o.callout === "string") {
      const t = [...o.callout.trim()].filter((ch) => /\p{L}|\p{N}/u.test(ch)).slice(0, 8).join("");
      if (t) style.callout = t;
    }
    if (typeof o.slashes === "number" && Number.isFinite(o.slashes)) style.slashes = Math.max(0, Math.min(12, Math.round(o.slashes)));
    if ((PROJECTILE_LOOKS as readonly unknown[]).includes(o.projectile)) style.projectile = o.projectile as MoveStyle["projectile"];
    if ((ZONE_LOOKS as readonly unknown[]).includes(o.zone)) style.zone = o.zone as MoveStyle["zone"];
    if ((HAND_LOOKS as readonly unknown[]).includes(o.hand)) style.hand = o.hand as MoveStyle["hand"];
    if (typeof o.color === "string" && COLOR.test(o.color)) style.color = o.color;
    if (typeof o.weapon === "string" && /^[A-Za-z0-9_]{1,40}$/.test(o.weapon)) style.weapon = o.weapon;
    if ((SIGNATURE_POSES as readonly unknown[]).includes(o.pose)) style.pose = o.pose as MoveStyle["pose"];
    out[id] = style;
  }
  return out;
}

function parseLook(v: unknown): Look | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!ALL_MODELS.includes(o.model as string)) return undefined;
  const show = Array.isArray(o.show) ? o.show.filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9_]{1,40}$/.test(s)).slice(0, 20) : [];
  const tint = typeof o.tint === "string" && COLOR.test(o.tint) ? o.tint : "#ffffff";
  const look: Look = { model: o.model as ModelId, show, tint };
  if (typeof o.aura === "string" && COLOR.test(o.aura)) look.aura = o.aura;
  if (o.burning === true) look.burning = true;
  if (typeof o.height === "number" && o.height >= 0.8 && o.height <= 2.4) look.height = o.height;
  if (look.model === "vrm") {
    if (typeof o.file !== "string" || !VRM_FILE.test(o.file)) return undefined;
    look.file = o.file;
  }
  for (const k of ["hair", "outfit", "accent", "trim", "skin", "eyes"] as const) if (typeof o[k] === "string" && COLOR.test(o[k] as string)) look[k] = o[k] as string;
  if (typeof o.emblem === "string") {
    const t = [...o.emblem.trim()].filter((ch) => /\p{L}|\p{N}/u.test(ch)).slice(0, 8).join("");
    if (t) look.emblem = t;
  }
  if (o.expression === "fierce" || o.expression === "calm" || o.expression === "wild") look.expression = o.expression;
  return look;
}
