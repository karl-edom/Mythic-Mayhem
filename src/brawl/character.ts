// Identity layer (layer A): display only. The engine never reads it, so any
// value here is harmless; it is still sanitised before reaching the screen.

export interface Character {
  name: string;
  universe: string;
  description: string;
  colors: { primary: string; secondary: string };
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
  };
}
