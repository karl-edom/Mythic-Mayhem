import assert from "node:assert/strict";
import { test } from "node:test";
import type { FighterKit } from "../src/brawl/kit.ts";
import { AXES, rateProfiles } from "../src/brawl/profile.ts";

// Select-screen profile: ratings 1–5 worked out from the kits, ranked against the roster.

const strike = { damage: 50, startup: 0.1, active: 0.1, recovery: 0.2, reach: 1, size: 0.6, hitstun: 0.3, knockback: 2 };
const base: FighterKit = {
  schemaVersion: 3,
  id: "base",
  archetype: "balanced",
  stats: { hp: 1000, moveSpeed: 6, jumpSpeed: 10, weight: 1, radius: 0.5 },
  light: { hits: [strike] },
  heavy: { ...strike, damage: 100, maxCharge: 1, chargeBonus: 2 },
  specials: [],
};

test("ratings stay between 1 and 5, the extremes of the roster get 1 and 5", () => {
  const slow = { ...base, id: "slow", stats: { ...base.stats, moveSpeed: 4 } };
  const fast = { ...base, id: "fast", stats: { ...base.stats, moveSpeed: 9 } };
  const r = rateProfiles([slow, base, fast]);
  assert.equal(r.get(slow)!.speed, 1);
  assert.equal(r.get(fast)!.speed, 5);
  for (const k of [slow, base, fast]) for (const a of AXES) assert.ok(r.get(k)![a] >= 1 && r.get(k)![a] <= 5);
});

test("more life and weight is tougher; a projectile reaches further; a long dash is more mobile", () => {
  const tank = { ...base, id: "tank", stats: { ...base.stats, hp: 1400, weight: 1.3 } };
  const zoner: FighterKit = {
    ...base,
    id: "zoner",
    specials: [{ id: "tir", energyCost: 30, startup: 0.3, recovery: 0.4, delivery: { type: "projectile", speed: 14, range: 11, size: 0.5 }, damage: 80, hitstun: 0.5, knockback: 6, guardBreak: false }],
  };
  const dasher: FighterKit = {
    ...base,
    id: "dasher",
    specials: [{ id: "ruee", energyCost: 30, startup: 0.3, recovery: 0.4, delivery: { type: "rush", distance: 9, speed: 30, size: 0.6 }, damage: 80, hitstun: 0.5, knockback: 6, guardBreak: false }],
  };
  const r = rateProfiles([base, tank, zoner, dasher]);
  assert.ok(r.get(tank)!.toughness > r.get(base)!.toughness);
  assert.ok(r.get(zoner)!.reach > r.get(base)!.reach);
  assert.ok(r.get(dasher)!.mobility > r.get(base)!.mobility);
});

test("a roster where everyone is equal rates everyone in the middle", () => {
  const twin = { ...base, id: "twin" };
  const r = rateProfiles([base, twin]);
  for (const a of AXES) assert.equal(r.get(base)![a], 3);
});
