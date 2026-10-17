// Identity layer (layer A): display only. The engine never reads it, so any
// value here is harmless; it is still sanitised before reaching the screen.

/** Chibi 3D models available to every pack (KayKit Adventurers, CC0). */
export const MODELS = ["knight", "barbarian", "mage", "rogue", "rogue_hooded"] as const;
/** Anime 3D models available to every pack (VRoid Studio samples, CC0). */
export const ANIME_MODELS = ["kaito", "fumiriya", "shino", "akane", "vita", "rubin"] as const;
/** Models built entirely in code (no file), on the same humanoid skeleton as the anime ones. */
export const PROCEDURAL_MODELS = ["turtle", "swordsman"] as const;
export type ModelId = (typeof MODELS)[number] | (typeof ANIME_MODELS)[number] | (typeof PROCEDURAL_MODELS)[number];
const ALL_MODELS: readonly string[] = [...MODELS, ...ANIME_MODELS, ...PROCEDURAL_MODELS];

/** Humanoid models (anime or procedural): they play the retargeted clips. */
export const isAnime = (m: ModelId): m is (typeof ANIME_MODELS)[number] | (typeof PROCEDURAL_MODELS)[number] =>
  (ANIME_MODELS as readonly string[]).includes(m) || (PROCEDURAL_MODELS as readonly string[]).includes(m);

export interface Look {
  model: ModelId;
  /** Accessories to show (weapons, shields, hats…), by mesh name; all others are hidden. */
  show: string[];
  /** Colour multiplied over the model's texture ("#ffffff" = unchanged). */
  tint: string;
  /** Anime models: colour multiplied over the hair, and over the clothes. */
  hair?: string;
  outfit?: string;
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
  /** Short text written on screen when the special starts (e.g. its name in kanji), ≤ 8 characters. */
  callout?: string;
  /** Number of blade slashes drawn across the target when the special hits (0–12). */
  slashes?: number;
  /** Look of a projectile special: a ball of light (default) or one of the drawn objects. */
  projectile?: (typeof PROJECTILE_LOOKS)[number];
}

export const PROJECTILE_LOOKS = ["pizza"] as const;

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
    out[id] = style;
  }
  return out;
}

function parseLook(v: unknown): Look | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!ALL_MODELS.includes(o.model as string)) return undefined;
  const show = Array.isArray(o.show) ? o.show.filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9_]{1,40}$/.test(s)).slice(0, 8) : [];
  const tint = typeof o.tint === "string" && COLOR.test(o.tint) ? o.tint : "#ffffff";
  const look: Look = { model: o.model as ModelId, show, tint };
  for (const k of ["hair", "outfit"] as const) if (typeof o[k] === "string" && COLOR.test(o[k] as string)) look[k] = o[k] as string;
  if (o.expression === "fierce" || o.expression === "calm" || o.expression === "wild") look.expression = o.expression;
  return look;
}
