import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArena, validateArena, type ArenaDef } from "../src/brawl/arena.ts";
import type { FighterKit } from "../src/brawl/kit.ts";
import { loadAllPacks, loadArenas, loadPropCatalog } from "../src/brawl/load.ts";
import { runDuel } from "../src/brawl/match.ts";
import { canSee, createBrawl, step, type BrawlWorld, type Command } from "../src/brawl/world.ts";

const catalog = loadPropCatalog();
const strike = { damage: 50, startup: 0.1, active: 0.1, recovery: 0.2, reach: 1, size: 0.6, hitstun: 0.3, knockback: 2 };
const kit: FighterKit = {
  schemaVersion: 2,
  id: "test",
  archetype: "balanced",
  stats: { hp: 1000, moveSpeed: 6, jumpSpeed: 10, weight: 1, radius: 0.5 },
  light: { hits: [strike] },
  heavy: { ...strike, damage: 100, startup: 0.4, knockback: 14, maxCharge: 1, chargeBonus: 2 },
  specials: [
    {
      id: "boule", energyCost: 10, startup: 0.1, recovery: 0.2, delivery: { type: "projectile", speed: 20, range: 15, size: 0.5 },
      damage: 100, hitstun: 0.4, knockback: 4, guardBreak: false,
    },
  ],
};

function arena(props: ArenaDef["props"]): ArenaDef {
  return { schemaVersion: 1, id: "test", name: "Test", width: 40, depth: 30, ground: "#ffffff", spawns: [{ x: -8, z: 0 }, { x: 8, z: 0 }], props };
}

function world(props: ArenaDef["props"], ax = -3, bx = 3): BrawlWorld {
  return createBrawl(
    [
      { kit, team: 0, pos: { x: ax, y: 0, z: 0 } },
      { kit, team: 1, pos: { x: bx, y: 0, z: 0 } },
    ],
    undefined,
    buildArena(arena(props), catalog),
  );
}

const run = (w: BrawlWorld, seconds: number, cmds: () => Command[] = () => []) => {
  for (let i = 0; i < Math.round(seconds * w.config.tickRate); i++) step(w, cmds());
};

test("les arènes du dépôt sont valides", () => {
  const defs = loadArenas(catalog);
  assert.ok(defs.length >= 2);
  for (const d of defs) assert.ok(d.width * d.depth > 40 * 30, `${d.id} doit être plus grande que le terrain vague`);
});

test("le validateur refuse un élément inconnu, hors des murs ou sur un point d'apparition", () => {
  assert.equal(validateArena(arena([{ kind: "vaisseau", x: 0, z: 0 }]), catalog).ok, false);
  assert.equal(validateArena(arena([{ kind: "house", x: 18, z: 0 }]), catalog).ok, false);
  assert.equal(validateArena(arena([{ kind: "rock", x: -8, z: 0 }]), catalog).ok, false);
  assert.equal(validateArena(arena([{ kind: "rock", x: 0, z: 0 }]), catalog).ok, true);
});

test("un rocher bloque le passage et cache les combattants l'un de l'autre", () => {
  const w = world([{ kind: "rock", x: 0, z: 0 }]);
  const [a, b] = w.fighters;
  assert.equal(canSee(w, a!, b!), false);
  run(w, 2, () => [{ unit: 0, move: { x: 1, z: 0 } }]);
  assert.ok(a!.pos.x < -1.5 + 0.01, `bloqué par le rocher (x = ${a!.pos.x})`);
  const open = world([]);
  assert.equal(canSee(open, open.fighters[0]!, open.fighters[1]!), true);
});

test("un rocher arrête les projectiles", () => {
  const w = world([{ kind: "rock", x: 0, z: 0 }]);
  step(w, [{ unit: 0, special: 0 }]);
  run(w, 1.5);
  assert.equal(w.fighters[1]!.hp, 1000);
  assert.equal(w.projectiles.length, 0);
});

test("une caisse se casse sous les coups, puis ne bloque plus rien", () => {
  const w = world([{ kind: "crate", x: -1.6, z: 0 }], -3, 10);
  for (let i = 0; i < 2; i++) {
    step(w, [{ unit: 0, light: true }]);
    run(w, 0.5);
  }
  const crate = w.arena.props[0]!;
  assert.equal(crate.alive, false, `PV restants : ${crate.hp}`);
  assert.ok(w.events.some((e) => e.type === "propBroken"));
});

test("on peut sauter sur une caisse et y rester debout", () => {
  const w = world([{ kind: "crate", x: -1.5, z: 0 }], -3, 10);
  step(w, [{ unit: 0, jump: true, move: { x: 1, z: 0 } }]);
  run(w, 0.35, () => [{ unit: 0, move: { x: 1, z: 0 } }]); // arrêt au-dessus de la caisse
  run(w, 1);
  const a = w.fighters[0]!;
  assert.ok(Math.abs(a.pos.y - 1.1) < 1e-6, `sur la caisse (y = ${a.pos.y})`);
});

test("un duel de bots se termine sur chaque arène", () => {
  const kits = loadAllPacks()
    .filter((p) => p.dir.startsWith("data/"))
    .map((p) => (p.result.ok ? p.result.kit : (undefined as never)));
  for (const def of loadArenas(catalog)) {
    const r = runDuel(kits[0]!, kits[1]!, 3, undefined, undefined, buildArena(def, catalog));
    assert.equal(r.world.over, true, def.id);
  }
});
