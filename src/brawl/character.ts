// Identity layer (layer A): display only. The engine never reads it, so any
// value here is harmless; it is still sanitised before reaching the screen.

/** 3D models available to every pack (KayKit Adventurers, CC0). */
export const MODELS = ["knight", "barbarian", "mage", "rogue", "rogue_hooded"] as const;
export type ModelId = (typeof MODELS)[number];

export interface Look {
  model: ModelId;
  /** Accessories to show (weapons, shields, hats…), by mesh name; all others are hidden. */
  show: string[];
  /** Colour multiplied over the model's texture ("#ffffff" = unchanged). */
  tint: string;
}

export interface Character {
  name: string;
  universe: string;
  description: string;
  colors: { primary: string; secondary: string };
  /** Absent: the client picks a model from the fighter's archetype. */
  look?: Look;
}

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
  };
}

function parseLook(v: unknown): Look | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!MODELS.includes(o.model as ModelId)) return undefined;
  const show = Array.isArray(o.show) ? o.show.filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9_]{1,40}$/.test(s)).slice(0, 8) : [];
  const tint = typeof o.tint === "string" && COLOR.test(o.tint) ? o.tint : "#ffffff";
  return { model: o.model as ModelId, show, tint };
}
