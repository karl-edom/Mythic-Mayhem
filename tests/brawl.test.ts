import assert from "node:assert/strict";
import { test } from "node:test";
import type { FighterKit, Special } from "../src/brawl/kit.ts";
import { loadAllPacks, loadBrawlCosts } from "../src/brawl/load.ts";
import { runDuel } from "../src/brawl/match.ts";
import { validateFighter } from "../src/brawl/validate.ts";
import { BRAWL_CONFIG, createBrawl, step, type BrawlWorld, type Command } from "../src/brawl/world.ts";

const strike = { damage: 50, startup: 0.1, active: 0.1, recovery: 0.2, reach: 1, size: 0.6, hitstun: 0.3, knockback: 2 };

function fighter(specials: Special[] = []): FighterKit {
  return {
    schemaVersion: 2,
    id: "test",
    archetype: "balanced",
    stats: { hp: 1000, moveSpeed: 6, jumpSpeed: 10, weight: 1, radius: 0.5 },
    light: { hits: [strike, { ...strike, knockback: 14 }] },
    heavy: { ...strike, damage: 100, startup: 0.4, knockback: 14, maxCharge: 1, chargeBonus: 2 },
    specials,
  };
}

/** Two fighters `gap` metres apart on the x axis, facing each other. */
function duel(a: FighterKit, b: FighterKit, gap = 1.6): BrawlWorld {
  return createBrawl([
    { kit: a, team: 0, pos: { x: 0, y: 0, z: 0 } },
    { kit: b, team: 1, pos: { x: gap, y: 0, z: 0 } },
  ]);
}

const run = (w: BrawlWorld, seconds: number, cmds: (w: BrawlWorld) => Command[] = () => []) => {
  for (let i = 0; i < Math.round(seconds * w.config.tickRate); i++) step(w, cmds(w));
};

test("l'attaque légère touche après son démarrage, pas avant", () => {
  const w = duel(fighter(), fighter());
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.05);
  assert.equal(w.fighters[1]!.hp, 1000);
  run(w, 0.1);
  assert.equal(w.fighters[1]!.hp, 950);
  assert.equal(w.fighters[1]!.action?.kind, "hitstun");
});

test("la garde bloque l'attaque légère (dégâts réduits), l'attaque lourde la brise", () => {
  const w = duel(fighter(), fighter());
  step(w, [{ unit: 0, light: true }, { unit: 1, guard: true }]);
  run(w, 0.2, () => [{ unit: 1, guard: true }]);
  assert.equal(w.fighters[1]!.hp, 1000 - 50 * BRAWL_CONFIG.guardChip);

  const w2 = duel(fighter(), fighter());
  step(w2, [{ unit: 0, heavy: true }, { unit: 1, guard: true }]);
  run(w2, 0.6, () => [{ unit: 1, guard: true }]); // heavy relâché aussitôt : pas de charge
  assert.equal(w2.fighters[1]!.action?.kind, "guardbroken");
  assert.equal(w2.fighters[1]!.hp, 1000 - 100 * BRAWL_CONFIG.guardBreakDamage);
});

test("charger l'attaque lourde augmente ses dégâts", () => {
  const w = duel(fighter(), fighter());
  run(w, 1.1, () => [{ unit: 0, heavy: true }]); // charge complète (plafonnée)
  run(w, 0.6);
  assert.equal(w.fighters[1]!.hp, 800); // 100 × 2
});

test("l'esquive rend invulnérable à son début", () => {
  const w = duel(fighter(), fighter());
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.05);
  step(w, [{ unit: 1, dodge: true }]);
  run(w, 0.15);
  assert.equal(w.fighters[1]!.hp, 1000);
  assert.equal(w.fighters[1]!.energy < BRAWL_CONFIG.energyStart, true);
});

test("une spéciale coûte de l'énergie et ne part pas sans assez d'énergie", () => {
  const proj: Special = {
    id: "boule", energyCost: 60, startup: 0.1, recovery: 0.2, delivery: { type: "projectile", speed: 20, range: 10, size: 0.5 },
    damage: 120, hitstun: 0.4, knockback: 4, guardBreak: false,
  };
  const w = duel(fighter([proj]), fighter(), 6);
  step(w, [{ unit: 0, special: 0 }]);
  assert.equal(w.fighters[0]!.action, null, "50 d'énergie < 60");
  w.fighters[0]!.energy = 100;
  step(w, [{ unit: 0, special: 0 }]);
  run(w, 0.5);
  assert.equal(w.fighters[1]!.hp, 880);
  assert.ok(w.fighters[0]!.energy < 50);
});

test("une zone ne frappe qu'à la fin de son télégraphe", () => {
  const area: Special = {
    id: "zone", energyCost: 20, startup: 0.1, recovery: 0.2, delivery: { type: "area", castRange: 10, radius: 1.5, delay: 0.6 },
    damage: 100, hitstun: 0.4, knockback: 4, guardBreak: false,
  };
  const w = duel(fighter([area]), fighter(), 6);
  step(w, [{ unit: 0, special: 0 }]);
  run(w, 0.6);
  assert.equal(w.fighters[1]!.hp, 1000);
  assert.equal(w.zones.length, 1);
  run(w, 0.2);
  assert.equal(w.fighters[1]!.hp, 900);
});

test("un K.-O. remplit la jauge de victoire ; le personnage réapparaît invulnérable", () => {
  const w = duel(fighter(), fighter());
  w.fighters[1]!.hp = 10;
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.2);
  assert.deepEqual(w.score, [1, 0]);
  assert.equal(w.fighters[1]!.alive, false);
  run(w, BRAWL_CONFIG.respawnDelay);
  assert.equal(w.fighters[1]!.alive, true);
  assert.equal(w.fighters[1]!.hp, 1000);
  assert.ok(w.fighters[1]!.invulnerableUntil > w.time);
});

test("trois K.-O. donnent la victoire", () => {
  const w = duel(fighter(), fighter());
  w.score[0] = 2;
  w.fighters[1]!.hp = 10;
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.2);
  assert.equal(w.over, true);
  assert.equal(w.winner, 0);
});

test("le validateur refuse un kit hors budget ou sans contre-jeu", () => {
  const costs = loadBrawlCosts();
  const shot: Special = {
    id: "tir", energyCost: 30, startup: 0.2, recovery: 0.3, delivery: { type: "projectile", speed: 15, range: 10, size: 0.5 },
    damage: 60, hitstun: 0.4, knockback: 4, guardBreak: false,
  };
  const tooStrong = fighter([shot, { ...shot, id: "tir-2", damage: 400, energyCost: 10 }]);
  const r = validateFighter(tooStrong, costs);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.startsWith("budget")));
  const instantHeavy = { ...fighter([shot]), heavy: { ...fighter().heavy, startup: 0.1 } };
  const r2 = validateFighter(instantHeavy, costs);
  assert.ok(!r2.ok && r2.errors.some((e) => e.startsWith("heavy.startup")));
  const r3 = validateFighter({ schemaVersion: 1 }, costs);
  assert.equal(r3.ok, false);
});

test("les combattants d'origine sont valides et un duel de bots se termine, de façon déterministe", () => {
  const packs = loadAllPacks().filter((p) => p.dir.startsWith("data/"));
  assert.ok(packs.length >= 2);
  for (const p of packs) assert.ok(p.result.ok, `${p.dir}: ${p.result.ok ? "" : p.result.errors.join(", ")}`);
  const [a, b] = packs.map((p) => (p.result.ok ? p.result.kit : (undefined as never)));
  const r1 = runDuel(a!, b!, 7);
  const r2 = runDuel(a!, b!, 7);
  assert.equal(r1.world.over, true);
  assert.deepEqual([r1.winner, r1.duration, r1.score], [r2.winner, r2.duration, r2.score]);
});

test("budget : une 2e et une 3e spéciale coûtent moins que la première (même jauge d'énergie)", async () => {
  const { fighterBudget } = await import("../src/brawl/budget.ts");
  const costs = loadBrawlCosts();
  const shot: Special = {
    id: "a", energyCost: 30, startup: 0.2, recovery: 0.3, delivery: { type: "projectile", speed: 15, range: 10, size: 0.5 },
    damage: 90, hitstun: 0.4, knockback: 4, guardBreak: false,
  };
  const one = fighterBudget(fighter([shot]), costs).total;
  const two = fighterBudget(fighter([shot, { ...shot, id: "b" }]), costs).total;
  const line = fighterBudget(fighter([shot]), costs).lines.find((l) => l.label === "special:a")!.points;
  assert.ok(two - one < line * 0.5, `la 2e spéciale coûte ${(two - one).toFixed(1)} pour ${line.toFixed(1)} la 1re`);
});

test("générateur : des kits aléatoires valides, ramenés au budget visé", async () => {
  const { randomRoster } = await import("../src/brawl/generate.ts");
  const { fighterBudget } = await import("../src/brawl/budget.ts");
  const { rng } = await import("../src/sim/math.ts");
  const costs = loadBrawlCosts();
  const kits = randomRoster(rng(5), 10, costs, 95);
  assert.equal(kits.length, 10);
  for (const k of kits) assert.ok(Math.abs(fighterBudget(k, costs).total - 95) < 1.5);
});

test("épreuve : les combattants d'origine gagnent entre 40 % et 60 % contre le panel de référence", async () => {
  const { BALANCED_BAND, gauntletRate, referencePanel } = await import("../src/brawl/gauntlet.ts");
  const costs = loadBrawlCosts();
  const panel = referencePanel(costs);
  for (const p of loadAllPacks(costs).filter((x) => x.dir.startsWith("data/"))) {
    assert.ok(p.result.ok);
    const rate = gauntletRate(p.result.kit, panel);
    assert.ok(rate >= BALANCED_BAND[0] && rate <= BALANCED_BAND[1], `${p.dir} : ${(rate * 100).toFixed(0)} %`);
  }
});
