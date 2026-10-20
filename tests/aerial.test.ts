import assert from "node:assert/strict";
import { test } from "node:test";
import type { FighterKit } from "../src/brawl/kit.ts";
import { BRAWL_CONFIG, aerialAim, createBrawl, step, type BrawlWorld, type Command } from "../src/brawl/world.ts";

// Directional aerials (decision 0027): up over the head, down under the feet (the meteor).

const strike = { damage: 50, startup: 0.1, active: 0.1, recovery: 0.2, reach: 1, size: 0.6, hitstun: 0.3, knockback: 2 };
const kit: FighterKit = {
  schemaVersion: 3,
  id: "test",
  archetype: "balanced",
  stats: { hp: 1000, moveSpeed: 6, jumpSpeed: 10, weight: 1, radius: 0.5 },
  light: { hits: [strike] },
  heavy: { ...strike, damage: 100, startup: 0.4, knockback: 14, maxCharge: 1, chargeBonus: 2 },
  specials: [],
};

/** A in the air at height `ay`, B in the air `dy` above it (negative: below), slightly ahead. */
function airborne(ay: number, dy: number): BrawlWorld {
  const w = createBrawl([
    { kit, team: 0, pos: { x: 0, y: ay, z: 0 } },
    { kit, team: 1, pos: { x: 0.3, y: ay + dy, z: 0 } },
  ]);
  return w;
}
const run = (w: BrawlWorld, seconds: number, cmds: () => Command[] = () => []) => {
  for (let i = 0; i < Math.round(seconds * w.config.tickRate); i++) step(w, cmds());
};

test("attaque en l'air vers le haut (saut maintenu) : touche au-dessus de la tête et soulève", () => {
  const w = airborne(4, 1.9);
  step(w, [{ unit: 0, light: true, jumpHeld: true }]);
  assert.equal(w.fighters[0]!.action?.kind === "aerial" && w.fighters[0]!.action.aim, "up");
  run(w, 0.12);
  const b = w.fighters[1]!;
  assert.equal(b.hp, 950);
  assert.ok(b.vel.y > 0, `vitesse verticale ${b.vel.y}`);
  assert.ok(w.events.some((e) => e.type === "hit" && e.aim === "up"));
});

test("attaque en l'air vers le bas (garde maintenue) : plus lente, plus forte, plaque au sol", () => {
  const c = BRAWL_CONFIG;
  const w = airborne(6, -2);
  step(w, [{ unit: 0, light: true, guard: true }]);
  assert.equal(w.fighters[0]!.action?.kind === "aerial" && w.fighters[0]!.action.aim, "down");
  // Not out yet when a side aerial would already have hit: the meteor is slower.
  run(w, strike.startup + 0.02);
  assert.equal(w.fighters[1]!.hp, 1000);
  run(w, c.aerialDownStartup + 0.02);
  const b = w.fighters[1]!;
  assert.equal(b.hp, 1000 - strike.damage * c.aerialDownDamage);
  assert.ok(b.vel.y <= -c.aerialSpikeSpeed + 1e-9, `vitesse verticale ${b.vel.y}`);
  assert.equal(b.action?.kind, "knockdown");
  assert.ok(w.events.some((e) => e.type === "hit" && e.aim === "down" && e.knockdown));
});

test("sans direction, l'attaque en l'air vise toute seule l'adversaire au-dessus, en dessous ou devant", () => {
  assert.equal(aerialAim(airborne(4, 1.9), airborne(4, 1.9).fighters[0]!, { unit: 0 }), "up");
  const below = airborne(6, -2);
  assert.equal(aerialAim(below, below.fighters[0]!, { unit: 0 }), "down");
  const level = airborne(4, 0);
  assert.equal(aerialAim(level, level.fighters[0]!, { unit: 0 }), "side");
  // A button held wins over the target's height.
  assert.equal(aerialAim(below, below.fighters[0]!, { unit: 0, jumpHeld: true }), "up");
});

test("l'attaque en l'air vers le bas ratée laisse plus longtemps sans défense (punissable)", () => {
  const c = BRAWL_CONFIG;
  const w = createBrawl([
    { kit, team: 0, pos: { x: 0, y: 12, z: 0 } },
    { kit, team: 1, pos: { x: 10, y: 0, z: 0 } },
  ]);
  step(w, [{ unit: 0, light: true, guard: true }]);
  run(w, strike.startup + strike.active + strike.recovery + 0.02, () => [{ unit: 0, guard: true }]);
  // A side aerial would be over by now; the meteor still runs.
  assert.equal(w.fighters[0]!.action?.kind, "aerial");
  run(w, c.aerialDownStartup + c.aerialDownRecovery);
  assert.notEqual(w.fighters[0]!.action?.kind, "aerial");
});
