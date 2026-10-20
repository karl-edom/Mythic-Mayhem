import assert from "node:assert/strict";
import { test } from "node:test";
import type { FighterKit } from "../src/brawl/kit.ts";
import { BRAWL_CONFIG, createBrawl, step, type BrawlWorld, type Command } from "../src/brawl/world.ts";
import { isFlick } from "../src/client/input.ts";

// Strong attacks by direction (decision 0028): the flick, the up smash, the sweep, the strong aerial.

const strike = { damage: 50, startup: 0.1, active: 0.1, recovery: 0.2, reach: 1, size: 0.6, hitstun: 0.3, knockback: 2 };
const kit: FighterKit = {
  schemaVersion: 3,
  id: "test",
  archetype: "balanced",
  stats: { hp: 1000, moveSpeed: 6, jumpSpeed: 10, weight: 1, radius: 0.5 },
  light: { hits: [strike] },
  heavy: { ...strike, damage: 100, startup: 0.4, knockback: 4, maxCharge: 1, chargeBonus: 2 },
  specials: [],
};
const run = (w: BrawlWorld, seconds: number, cmds: () => Command[] = () => []) => {
  for (let i = 0; i < Math.round(seconds * w.config.tickRate); i++) step(w, cmds());
};
const heavyAim = (w: BrawlWorld) => (w.fighters[0]!.action?.kind === "heavy" ? w.fighters[0]!.action.aim : null);

test("coup sec du joystick : du centre au bord en moins de 70 ms, pas une inclinaison lente", () => {
  assert.equal(isFlick([{ t: 0, m: 0 }, { t: 16, m: 0.4 }, { t: 33, m: 0.95 }]), true);
  assert.equal(isFlick([{ t: 0, m: 0 }, { t: 100, m: 0.5 }, { t: 200, m: 0.95 }]), false);
  assert.equal(isFlick([{ t: 0, m: 0.6 }, { t: 30, m: 0.95 }]), false);
  assert.equal(isFlick([{ t: 0, m: 0 }, { t: 30, m: 0.6 }]), false);
});

test("coup fort + garde : balayage bas qui touche devant et derrière", () => {
  const w = createBrawl([
    { kit, team: 0, pos: { x: 0, y: 0, z: 0 } },
    { kit, team: 1, pos: { x: 1.1, y: 0, z: 0 } },
    { kit, team: 1, pos: { x: -1.1, y: 0, z: 0 } },
  ]);
  step(w, [{ unit: 0, heavy: true, guard: true }]);
  assert.equal(heavyAim(w), "down");
  run(w, 0.5, () => [{ unit: 0 }]);
  assert.ok(w.fighters[1]!.hp < 1000 && w.fighters[2]!.hp < 1000, `${w.fighters[1]!.hp} / ${w.fighters[2]!.hp}`);
});

test("coup fort au sol : vise vers le haut un adversaire au-dessus (anti-aérien) et le soulève", () => {
  const w = createBrawl([
    { kit, team: 0, pos: { x: 0, y: 0, z: 0 } },
    { kit, team: 1, pos: { x: 0.4, y: 6, z: 0 } },
  ]);
  // The opponent falls into it; the strike waits above the head.
  run(w, 0.55);
  step(w, [{ unit: 0, heavy: true }]);
  assert.equal(heavyAim(w), "up");
  let lifted = false;
  for (let i = 0; i < 40 && !lifted; i++) {
    step(w, [{ unit: 0 }]);
    lifted = w.events.some((e) => e.type === "hit" && e.aim === "up");
  }
  assert.ok(lifted, "touché vers le haut");
  assert.ok(w.fighters[1]!.vel.y > 0);
});

test("saut et coup fort ensemble au sol : coup vers le haut, sans sauter", () => {
  const w = createBrawl([
    { kit, team: 0, pos: { x: 0, y: 0, z: 0 } },
    { kit, team: 1, pos: { x: 5, y: 0, z: 0 } },
  ]);
  step(w, [{ unit: 0, heavy: true, jump: true, jumpHeld: true }]);
  assert.equal(heavyAim(w), "up");
  run(w, 0.1, () => [{ unit: 0, jumpHeld: true }]);
  assert.equal(w.fighters[0]!.pos.y, 0);
});

test("coup fort en l'air : puissance du coup lourd, plus rapide, dirigé comme l'aérien", () => {
  const c = BRAWL_CONFIG;
  const w = createBrawl([
    { kit, team: 0, pos: { x: 0, y: 6, z: 0 } },
    { kit, team: 1, pos: { x: 1.2, y: 6, z: 0 } },
  ]);
  step(w, [{ unit: 0, heavy: true }]);
  const a = w.fighters[0]!.action;
  assert.ok(a?.kind === "aerial" && a.strong && a.aim === "side");
  const startup = Math.max(strike.startup + 0.04, 0.4 * c.strongAerialStartup);
  run(w, startup - 0.03);
  assert.equal(w.fighters[1]!.hp, 1000);
  run(w, 0.06);
  assert.equal(w.fighters[1]!.hp, 1000 - 100 * c.strongAerialDamage);
});
