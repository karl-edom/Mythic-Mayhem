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
    schemaVersion: 3,
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

test("bouclier : bloque l'attaque légère (dégâts réduits), l'attaque lourde l'use deux fois plus", () => {
  const c = BRAWL_CONFIG;
  const w = duel(fighter(), fighter());
  step(w, [{ unit: 0, light: true }, { unit: 1, guard: true }]);
  run(w, 0.2, () => [{ unit: 1, guard: true }]);
  const b = w.fighters[1]!;
  assert.equal(b.hp, 1000 - 50 * c.guardChip);
  // The hit's wear, plus a little drain while held (not during the block stun).
  const afterHit = c.shieldMax - 50 * c.shieldDamageFactor;
  assert.ok(b.shield <= afterHit && b.shield >= afterHit - c.shieldDrain * 0.2, `bouclier ${b.shield}`);

  const w2 = duel(fighter(), fighter());
  step(w2, [{ unit: 0, heavy: true }, { unit: 1, guard: true }]);
  run(w2, 0.6, () => [{ unit: 1, guard: true }]); // heavy relâché aussitôt : pas de charge
  const b2 = w2.fighters[1]!;
  assert.equal(b2.hp, 1000 - 100 * c.guardChip);
  const afterHeavy = c.shieldMax - 100 * c.shieldDamageFactor * 2;
  assert.ok(b2.shield <= afterHeavy && b2.shield >= afterHeavy - c.shieldDrain * 0.6, `bouclier ${b2.shield}`);
});

test("bouclier : se vide quand on le tient, casse à zéro (étourdi), se recharge une fois relâché", () => {
  const c = BRAWL_CONFIG;
  const w = duel(fighter(), fighter(), 6);
  const f = w.fighters[0]!;
  run(w, c.shieldMax / c.shieldDrain - 0.2, () => [{ unit: 0, guard: true }]);
  assert.equal(f.action?.kind, "guard");
  run(w, 0.4, () => [{ unit: 0, guard: true }]);
  assert.equal(f.action?.kind, "guardbroken", "bouclier cassé");
  assert.ok(w.events.some((e) => e.type === "guardBreak" && e.target === 0));
  run(w, c.guardBreakStun + 0.1);
  assert.equal(f.action, null);
  const low = f.shield;
  run(w, c.shieldRegenDelay + 1);
  assert.ok(f.shield > low + c.shieldRegen * 0.9, "il se recharge");
  // Impossible de lever un bouclier vide.
  f.shield = 0;
  f.shieldUsedAt = w.time; // pas encore rechargé
  step(w, [{ unit: 0, guard: true }]);
  assert.notEqual((f.action as { kind: string } | null)?.kind, "guard");
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

test("apparence : un look valide est lu, un look invalide est ignoré", async () => {
  const { parseCharacter } = await import("../src/brawl/character.ts");
  const ok = parseCharacter({ name: "X", look: { model: "mage", show: ["2H_Staff", "<script>"], tint: "#ff0000" } }, "x");
  assert.deepEqual(ok.look, { model: "mage", show: ["2H_Staff"], tint: "#ff0000" });
  assert.equal(parseCharacter({ look: { model: "dragon" } }, "x").look, undefined);
  const anime = parseCharacter({ look: { model: "shino", show: ["Kunai"], tint: "#ffffff", hair: "#ff0000", outfit: "rouge" } }, "x");
  assert.deepEqual(anime.look, { model: "shino", show: ["Kunai"], tint: "#ffffff", hair: "#ff0000" });
});

test("dégagement : sous les coups, il repousse l'agresseur sans dégâts et coûte 50 d'énergie", () => {
  const w = duel(fighter(), fighter());
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.12); // le premier coup touche : le défenseur (1) est en hitstun
  const victim = w.fighters[1]!;
  const attacker = w.fighters[0]!;
  assert.equal(victim.action?.kind, "hitstun");
  victim.energy = 60;
  const hpBefore = attacker.hp;
  const gapBefore = Math.abs(victim.pos.x - attacker.pos.x);
  step(w, [{ unit: 1, dodge: true }]);
  assert.equal(victim.action?.kind, "breaker");
  assert.ok(Math.abs(victim.energy - (60 - BRAWL_CONFIG.breakerCost)) < 0.1);
  assert.equal(attacker.action?.kind, "hitstun", "l'agresseur est interrompu");
  run(w, 0.3);
  assert.equal(attacker.hp, hpBefore, "aucun dégât");
  assert.ok(Math.abs(victim.pos.x - attacker.pos.x) > gapBefore + 1.5, "de la distance est regagnée");
});

test("dégagement : invulnérable pendant l'onde, impossible sans énergie ou depuis le sol", () => {
  const w = duel(fighter(), fighter());
  const [a, b] = w.fighters as [typeof w.fighters[0], typeof w.fighters[0]];
  b.action = { kind: "hitstun", until: w.time + 1 };
  b.energy = 40;
  step(w, [{ unit: 1, dodge: true }]);
  assert.equal(b.action?.kind, "hitstun", "pas assez d'énergie");
  b.energy = 100;
  b.action = { kind: "knockdown", until: w.time + 1 };
  step(w, [{ unit: 1, dodge: true }]);
  assert.equal(b.action?.kind, "knockdown", "pas depuis le sol");
  b.action = { kind: "guard" };
  step(w, [{ unit: 1, dodge: true }]);
  assert.equal(b.action?.kind, "breaker", "possible depuis la garde");
  // Un coup pendant l'onde ne fait rien.
  a.action = null;
  a.pos = { x: b.pos.x - 1.2, y: 0, z: 0 };
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.15);
  assert.equal(b.hp, 1000);
});

// ---------- Rythme v3 (décision 0011) ----------

test("v3 : double saut en l'air, une seule fois, rendu à l'atterrissage", () => {
  const w = duel(fighter(), fighter(), 8);
  const f = w.fighters[0]!;
  step(w, [{ unit: 0, jump: true }]);
  run(w, 0.3);
  const vBefore = f.vel.y;
  step(w, [{ unit: 0, jump: true }]);
  assert.ok(f.vel.y > vBefore + 3, "le second saut relance vers le haut");
  assert.equal(f.airJumpsLeft, 0);
  run(w, 0.2);
  const v2 = f.vel.y;
  step(w, [{ unit: 0, jump: true }]);
  assert.ok(f.vel.y < v2, "pas de troisième saut");
  run(w, 3);
  assert.equal(f.pos.y, 0);
  assert.equal(f.airJumpsLeft, BRAWL_CONFIG.airJumps);
});

test("v3 : J en l'air donne un coup aérien ; atterrir pendant le coup coûte un court temps", () => {
  const w = duel(fighter(), fighter(), 8);
  const f = w.fighters[0]!;
  // A slow aerial (long recovery) so that the fall ends while it is still going.
  f.kit = { ...f.kit, light: { hits: [{ ...strike, recovery: 1.5 }] } };
  step(w, [{ unit: 0, jump: true }]);
  run(w, 0.4);
  step(w, [{ unit: 0, light: true }]);
  assert.equal(f.action?.kind, "aerial");
  let ticks = 0;
  while (f.pos.y > 0 && ticks++ < 200) step(w, []);
  assert.equal((f.action as { kind: string } | null)?.kind, "landing", "temps d'atterrissage");
  run(w, BRAWL_CONFIG.landingLag + 0.02);
  assert.equal(f.action, null);
});

test("v3 : le recul grandit quand la vie baisse", () => {
  const speedAt = (hp: number) => {
    const w = duel(fighter(), fighter());
    w.fighters[1]!.hp = hp;
    step(w, [{ unit: 0, light: true }]);
    run(w, 0.12);
    return Math.hypot(w.fighters[1]!.vel.x, w.fighters[1]!.vel.z);
  };
  const full = speedAt(1000);
  const low = speedAt(300);
  assert.ok(full > 0);
  assert.ok(low > full * 1.3, `${full} → ${low}`);
});

test("v3 : une esquive ne peut pas suivre immédiatement la précédente", () => {
  const w = duel(fighter(), fighter(), 6);
  const f = w.fighters[0]!;
  step(w, [{ unit: 0, dodge: true, move: { x: 0, z: 1 } }]);
  run(w, BRAWL_CONFIG.dodgeDuration + 0.02);
  assert.equal(f.action, null);
  step(w, [{ unit: 0, dodge: true, move: { x: 0, z: 1 } }]);
  assert.equal(f.action, null, "en attente");
  run(w, BRAWL_CONFIG.dodgeCooldown);
  step(w, [{ unit: 0, dodge: true, move: { x: 0, z: 1 } }]);
  assert.equal((f.action as { kind: string } | null)?.kind, "dodge");
});

test("v3 : le validateur impose combo court, éjection finale et coups ratés punissables", () => {
  const costs = loadBrawlCosts();
  const base = loadAllPacks(costs).find((p) => p.result.ok)!;
  const kit = (base.result as { kit: FighterKit }).kit;
  const errs = (k: FighterKit) => {
    const r = validateFighter(k, { ...costs, budget: { ...costs.budget, min: 0, max: Infinity } });
    return r.ok ? [] : r.errors.join(" | ");
  };
  assert.deepEqual(errs(kit), []);
  const hits = kit.light.hits;
  assert.match(String(errs({ ...kit, light: { hits: [...hits, hits[0]!] } })), /entre 1 et 3/);
  assert.match(String(errs({ ...kit, light: { hits: hits.map((h, i) => (i === hits.length - 1 ? { ...h, knockback: 8 } : h)) } })), /éjecte/);
  assert.match(String(errs({ ...kit, light: { hits: hits.map((h) => ({ ...h, recovery: 0.1 })) } })), /recovery/);
  assert.match(String(errs({ ...kit, heavy: { ...kit.heavy, recovery: 0.3 } })), /heavy.recovery/);
});
