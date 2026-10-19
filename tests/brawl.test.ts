import assert from "node:assert/strict";
import { test } from "node:test";
import type { FighterKit, Special } from "../src/brawl/kit.ts";
import { loadBrawlCosts } from "../src/brawl/load.ts";
import { randomRoster } from "../src/brawl/generate.ts";
import { rng as seeded } from "../src/sim/math.ts";

/** Valid kits at the target budget (the first original fighters were retired, decision 0024). */
const sampleKits = (n: number, seed = 11): FighterKit[] => {
  const costs = loadBrawlCosts();
  return randomRoster(seeded(seed), n, costs, costs.budget.target);
};
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

test("saut plongeant : cercle d'atterrissage visible dès l'envol, frappe à l'arrivée ; coupé en l'air, il disparaît", () => {
  const leap: Special = {
    id: "saut", energyCost: 20, startup: 0.1, recovery: 0.3, delivery: { type: "leap", range: 8, height: 4, radius: 1.2 },
    damage: 120, hitstun: 0.4, knockback: 6, guardBreak: false,
  };
  const flight = 2 * Math.sqrt((2 * 4) / BRAWL_CONFIG.gravity);
  const w = duel(fighter([leap]), fighter(), 6);
  step(w, [{ unit: 0, special: 0 }]);
  run(w, 0.15);
  const a = w.fighters[0]!;
  assert.equal(a.action?.kind, "leap");
  assert.equal(w.zones.length, 1);
  assert.ok(Math.abs(w.zones[0]!.center.x - 6) < 0.05, "le cercle est sur la cible");
  run(w, flight / 2);
  assert.ok(a.pos.y > 3, `au sommet : ${a.pos.y}`);
  assert.equal(w.fighters[1]!.hp, 1000);
  run(w, flight / 2 + 0.05);
  assert.equal(w.fighters[1]!.hp, 880);
  assert.ok(Math.abs(a.pos.y) < 1e-6 && Math.abs(a.pos.x - 6) < 1.2, `posé près de la cible : ${a.pos.x}`);

  // Struck out of the air (by a projectile): no landing strike.
  const w2 = duel(fighter([leap]), fighter(), 6);
  step(w2, [{ unit: 0, special: 0 }]);
  run(w2, 0.3);
  w2.projectiles.push({ owner: 1, team: 1, slot: 0, pos: { ...w2.fighters[0]!.pos, y: w2.fighters[0]!.pos.y + 0.9 }, dir: { x: -1, y: 0, z: 0 }, speed: 1, remaining: 0.5, size: 0.6, hit: { damage: 10, hitstun: 0.3, knockback: 2, guardBreak: false, by: "special" } });
  run(w2, 0.05);
  assert.equal(w2.fighters[0]!.action?.kind, "hitstun");
  assert.equal(w2.zones.length, 0);
  run(w2, flight);
  assert.equal(w2.fighters[1]!.hp, 1000);
});

test("contre : un coup au corps à corps est esquivé et puni dans le dos ; dans le vide, toute la récupération", () => {
  const counter: Special = {
    id: "contre", energyCost: 20, startup: 0.05, recovery: 0.5, delivery: { type: "counter", window: 0.5 },
    damage: 150, hitstun: 0.5, knockback: 8, guardBreak: false,
  };
  const w = duel(fighter([counter]), fighter());
  step(w, [{ unit: 0, special: 0 }]);
  run(w, 0.08);
  assert.equal(w.fighters[0]!.action?.kind, "counter");
  step(w, [{ unit: 1, light: true }]);
  run(w, 0.2);
  const [d, att] = [w.fighters[0]!, w.fighters[1]!];
  assert.equal(d.hp, 1000, "le contre ne prend rien");
  assert.equal(att.hp, 850);
  assert.ok(w.events.some((e) => e.type === "counter"));
  // The attacker faced −x (toward the defender): the defender is now on its +x side, its back.
  assert.ok(d.pos.x > att.pos.x, `derrière : ${d.pos.x} / ${att.pos.x}`);

  const w2 = duel(fighter([counter]), fighter());
  step(w2, [{ unit: 0, special: 0 }]);
  run(w2, 0.6);
  assert.equal(w2.fighters[0]!.action?.kind, "special", "toujours engagé après une fenêtre vide");
  step(w2, [{ unit: 1, light: true }]);
  run(w2, 0.2);
  assert.equal(w2.fighters[0]!.hp, 950, "la récupération se punit");
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

test("un duel de bots se termine, de façon déterministe", async () => {
  const { randomRoster } = await import("../src/brawl/generate.ts");
  const { rng } = await import("../src/sim/math.ts");
  const costs = loadBrawlCosts();
  const [a, b] = randomRoster(rng(3), 2, costs, costs.budget.target);
  for (const k of [a!, b!]) assert.ok(validateFighter(k, costs).ok);
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

test("apparence : un look valide est lu, un look invalide est ignoré", async () => {
  const { parseCharacter } = await import("../src/brawl/character.ts");
  const ok = parseCharacter({ name: "X", look: { model: "swordsman", show: ["2H_Staff", "<script>"], tint: "#ff0000" } }, "x");
  assert.deepEqual(ok.look, { model: "swordsman", show: ["2H_Staff"], tint: "#ff0000" });
  assert.equal(parseCharacter({ look: { model: "dragon" } }, "x").look, undefined);
  const anime = parseCharacter({ look: { model: "turtle", show: ["Kunai"], tint: "#ffffff", hair: "#ff0000", outfit: "rouge" } }, "x");
  assert.deepEqual(anime.look, { model: "turtle", show: ["Kunai"], tint: "#ffffff", hair: "#ff0000" });
  // Les premiers modèles (KayKit, VRoid) ont été retirés : un look qui les nomme est ignoré.
  assert.equal(parseCharacter({ look: { model: "mage", show: [] } }, "x").look, undefined);
  assert.equal(parseCharacter({ look: { model: "turtle", show: ["Bo"], expression: "wild" } }, "x").look?.expression, "wild");
  assert.equal(parseCharacter({ look: { model: "turtle", show: [], expression: "sad" } }, "x").look?.expression, undefined);
  // Technique presentation: letters only (any script), at most 8; slashes within 0–12.
  const moves = parseCharacter({ moves: { "coup-1": { callout: "龍<b>槌</b>閃", slashes: 40 }, "BAD ID": { callout: "x" } } }, "x").moves;
  assert.deepEqual(moves, { "coup-1": { callout: "龍b槌b閃", slashes: 12 } });
  assert.deepEqual(parseCharacter({ moves: { tir: { projectile: "pizza" }, autre: { projectile: "<img>" } } }, "x").moves, { tir: { projectile: "pizza" }, autre: {} });
  // Looks of the techniques: closed lists, a colour, a weapon name; anything else dropped.
  const fx = parseCharacter({
    moves: {
      kame: { projectile: "beam", color: "#6ec8ff", hand: "ki" },
      feu: { zone: "fire", hand: "fire", color: "orange" },
      tir: { projectile: "bullet", weapon: "Sniper" },
      faux: { zone: "lava", hand: "<b>", weapon: "../x", pose: "dance" },
      estoc: { pose: "gatotsu", weapon: "None" },
      rayon: { pose: "kamehameha", projectile: "beam" },
    },
  }, "x").moves;
  assert.deepEqual(fx, {
    kame: { projectile: "beam", color: "#6ec8ff", hand: "ki" },
    feu: { zone: "fire", hand: "fire" },
    tir: { projectile: "bullet", weapon: "Sniper" },
    faux: {},
    estoc: { pose: "gatotsu", weapon: "None" },
    rayon: { pose: "kamehameha", projectile: "beam" },
  });
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

test("usure des esquives : enchaînées, elles durent plus et protègent moins ; ça se dissipe", async () => {
  const { dodgeInvulnerability, dodgeLength } = await import("../src/brawl/world.ts");
  const c = BRAWL_CONFIG;
  const w = duel(fighter(), fighter(), 8);
  const f = w.fighters[0]!;
  f.energy = 100;
  const lengths: number[] = [];
  for (let i = 0; i < 3; i++) {
    step(w, [{ unit: 0, dodge: true, move: { x: 0, z: 1 } }]);
    const a = f.action as { kind: string; stale: number };
    assert.equal(a.kind, "dodge");
    lengths.push(dodgeLength(c, a.stale));
    while (f.action) step(w, []);
  }
  assert.ok(lengths[1]! > lengths[0]! && lengths[2]! > lengths[1]!, `durées ${lengths}`);
  assert.ok(dodgeInvulnerability(c, 3) < dodgeInvulnerability(c, 0));
  // Après une pause, l'usure retombe.
  run(w, c.dodgeStaleDecay * c.dodgeStaleMax);
  step(w, [{ unit: 0, dodge: true, move: { x: 0, z: 1 } }]);
  assert.equal((f.action as { stale: number }).stale, 0);
});

test("petit saut : relâcher le bouton pendant l'élan donne un saut plus bas", () => {
  const peak = (held: boolean) => {
    const w = duel(fighter(), fighter(), 8);
    const f = w.fighters[0]!;
    step(w, [{ unit: 0, jump: true, jumpHeld: held }]);
    assert.equal(f.action?.kind, "jumpsquat");
    let top = 0;
    for (let i = 0; i < 120; i++) {
      step(w, [{ unit: 0, jumpHeld: held }]);
      top = Math.max(top, f.pos.y);
    }
    return top;
  };
  const full = peak(true);
  const short = peak(false);
  assert.ok(short < full * 0.6 && short > full * 0.4, `${short} contre ${full}`);
});

test("parade : lâcher le bouclier juste avant l'impact annule le coup et laisse l'attaquant ouvert", () => {
  const c = BRAWL_CONFIG;
  const w = duel(fighter(), fighter());
  const [a, b] = [w.fighters[0]!, w.fighters[1]!];
  // B lève le bouclier, A lance un coup léger (impact à 0,1 s) ; B lâche 2 images avant l'impact.
  step(w, [{ unit: 1, guard: true }]);
  step(w, [{ unit: 0, light: true }, { unit: 1, guard: true }]);
  const impactTick = Math.round(0.1 * c.tickRate);
  for (let i = 1; i < impactTick - 2; i++) step(w, [{ unit: 1, guard: true }]);
  const shieldBefore = b.shield;
  run(w, 0.1);
  assert.equal(b.hp, 1000, "aucun dégât");
  assert.ok(Math.abs(b.shield - shieldBefore) < 2, "bouclier intact");
  assert.ok(w.events.some((e) => e.type === "parry" && e.unit === 1));
  assert.equal(a.action?.kind, "hitstun", "l'attaquant est ouvert");
});

test("lâcher le bouclier trop tôt coûte un temps mort, et le coup passe", () => {
  const c = BRAWL_CONFIG;
  const w = duel(fighter(), fighter());
  const b = w.fighters[1]!;
  run(w, 0.2, () => [{ unit: 1, guard: true }]);
  step(w, []); // lâché
  assert.equal(b.action?.kind, "shieldDrop");
  run(w, c.parryWindow + 0.02);
  step(w, [{ unit: 0, light: true }, { unit: 1, light: true }]);
  assert.equal(b.action?.kind, "shieldDrop", "pas d'attaque pendant le retrait du bouclier");
  run(w, 0.15);
  assert.ok(b.hp < 1000, "le coup passe");
});

test("sauter hors du bouclier évite le temps mort", () => {
  const w = duel(fighter(), fighter(), 6);
  const b = w.fighters[1]!;
  run(w, 0.2, () => [{ unit: 1, guard: true }]);
  step(w, [{ unit: 1, guard: true, jump: true, jumpHeld: true }]);
  assert.equal(b.action?.kind, "jumpsquat");
});

test("v3 : le validateur impose combo court, éjection finale et coups ratés punissables", () => {
  const costs = loadBrawlCosts();
  // A generated kit, brought to the v3 rules (the generator predates them).
  const raw = sampleKits(1)[0]!;
  const kit: FighterKit = {
    ...raw,
    light: { hits: raw.light.hits.map((h, i, all) => (i === all.length - 1 ? { ...h, knockback: Math.max(12, h.knockback), recovery: Math.max(0.4, h.recovery) } : { ...h, recovery: Math.max(0.2, h.recovery) })) },
    heavy: { ...raw.heavy, recovery: Math.max(0.6, raw.heavy.recovery) },
  };
  const errs = (k: FighterKit) => {
    const r = validateFighter(k, { ...costs, budget: { ...costs.budget, min: 0, max: Infinity } });
    return r.ok ? [] : r.errors.join(" | ");
  };
  assert.deepEqual(errs(kit), []);
  const hits = kit.light.hits;
  assert.match(String(errs({ ...kit, light: { hits: [...hits, ...hits, hits[0]!].slice(0, 4) } })), /entre 1 et 3/);
  assert.match(String(errs({ ...kit, light: { hits: hits.map((h, i) => (i === hits.length - 1 ? { ...h, knockback: 8 } : h)) } })), /éjecte/);
  assert.match(String(errs({ ...kit, light: { hits: hits.map((h) => ({ ...h, recovery: 0.1 })) } })), /recovery/);
  assert.match(String(errs({ ...kit, heavy: { ...kit.heavy, recovery: 0.3 } })), /heavy.recovery/);
});

// Moteur v4 (décision 0015) : aisance, fluidité, lisibilité.

test("v4 : gel à l'impact, l'attaquant et la cible s'arrêtent ensemble, puis le recul part", () => {
  const c = BRAWL_CONFIG;
  const w = duel(fighter(), fighter());
  step(w, [{ unit: 0, light: true }]);
  let t = 0;
  while (w.fighters[1]!.hp === 1000 && t++ < 60) step(w, []);
  const [a, b] = w.fighters as [BrawlWorld["fighters"][0], BrawlWorld["fighters"][0]];
  const lag = Math.min(c.hitlagMax, c.hitlagBase + 50 * c.hitlagPerDamage);
  assert.ok(Math.abs(a.hitlagUntil - w.time - lag) < 1e-9 && Math.abs(b.hitlagUntil - w.time - lag) < 1e-9);
  const aT = a.action?.kind === "light" ? a.action.t : -1;
  const bx = b.pos.x;
  step(w, []);
  assert.equal(a.action?.kind === "light" ? a.action.t : -2, aT, "l'attaque de l'attaquant est figée");
  assert.equal(b.pos.x, bx, "la cible ne recule pas encore");
  run(w, lag + 0.05);
  assert.ok(b.pos.x > bx, "après le gel, le recul part");
});

test("v4 : le combo ne continue que si le coup a touché ; dans le vide, un seul coup", () => {
  const w = duel(fighter(), fighter(), 6);
  for (let i = 0; i < 30; i++) step(w, [{ unit: 0, light: true }]);
  const a = w.fighters[0]!;
  assert.ok(a.action === null || (a.action.kind === "light" && a.action.index === 0), "pas de 2e coup dans le vide");
  const w2 = duel(fighter(), fighter());
  let second = false;
  for (let i = 0; i < 40; i++) {
    step(w2, [{ unit: 0, light: true }]);
    const act = w2.fighters[0]!.action;
    if (act?.kind === "light" && act.index === 1) second = true;
  }
  assert.ok(second, "au contact, le combo s'enchaîne");
});

test("v4 : on regarde où l'on court, et l'adversaire dès qu'on s'arrête", () => {
  const w = duel(fighter(), fighter(), 5);
  const a = w.fighters[0]!;
  run(w, 0.2, () => [{ unit: 0, move: { x: 0, z: 1 } }]);
  assert.ok(a.facing.z > 0.99, "face à sa course");
  run(w, 0.05);
  assert.ok(a.facing.x > 0.9, "face à l'adversaire à l'arrêt");
});

test("v4 : un saut garde l'élan de la course, et le perd peu à peu sans direction", () => {
  const w = duel(fighter(), fighter(), 20);
  const a = w.fighters[0]!;
  run(w, 0.2, () => [{ unit: 0, move: { x: 0, z: 1 } }]);
  step(w, [{ unit: 0, jump: true, jumpHeld: true, move: { x: 0, z: 1 } }]);
  run(w, 0.1, () => [{ unit: 0, jumpHeld: true, move: { x: 0, z: 1 } }]);
  assert.ok(a.pos.y > 0, "en l'air");
  const z0 = a.pos.z;
  run(w, 0.2, () => [{ unit: 0, jumpHeld: true }]); // direction relâchée
  const moved = a.pos.z - z0;
  assert.ok(moved > 6 * 0.2 * 0.8, `l'élan porte encore (${moved.toFixed(2)} m)`);
  assert.ok(Math.hypot(a.drift.x, a.drift.z) < 6, "et diminue");
});

test("v4 : une attaque avance vers la cible, sans la traverser", () => {
  const w = duel(fighter(), fighter(), 2);
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.15);
  const a = w.fighters[0]!;
  assert.ok(a.pos.x > 0.2, `le coup avance (${a.pos.x.toFixed(2)} m)`);
  assert.equal(w.fighters[1]!.hp, 950, "et touche une cible qui était un peu loin");
  const w2 = duel(fighter(), fighter(), 1.0);
  step(w2, [{ unit: 0, light: true }]);
  run(w2, 0.15);
  assert.ok(w2.fighters[1]!.pos.x - w2.fighters[0]!.pos.x >= 0.85 - 1e-6, "pas d'avancée quand la cible est déjà à portée");
});

// Combats à plusieurs (décision 0017).

test("multi : un match à 4 en chacun pour soi se termine, chaque équipe a son score", async () => {
  const { createMatch } = await import("../src/brawl/world.ts");
  const { botCommand, createBot } = await import("../src/brawl/bot.ts");
  const { rng } = await import("../src/sim/math.ts");
  const kits = sampleKits(4);
  const w = createMatch(kits.slice(0, 4).map((kit, i) => ({ kit, team: i })), { ...BRAWL_CONFIG, rule: "stock", stocks: 2 });
  assert.equal(w.score.length, 4);
  const r = rng(3);
  const bots = w.fighters.map(() => createBot(r));
  while (!w.over) step(w, w.fighters.map((f) => botCommand(w, f, bots[f.id]!)));
  if (w.winner !== null) {
    // Vies : seul le vainqueur a encore des combattants en lice (ou le temps a tranché).
    const standing = new Set(w.fighters.filter((f) => f.alive || f.stocks > 0).map((f) => f.team));
    assert.ok(standing.has(w.winner) || w.time >= w.config.timeLimit);
  }
});

test("multi : règle des vies, un combattant sans vie est éliminé et ne revient pas", async () => {
  const { createMatch } = await import("../src/brawl/world.ts");
  const w = createMatch([{ kit: fighter(), team: 0 }, { kit: fighter(), team: 1 }, { kit: fighter(), team: 1 }], { ...BRAWL_CONFIG, rule: "stock", stocks: 1 });
  const [a, b, c] = w.fighters as [BrawlWorld["fighters"][0], BrawlWorld["fighters"][0], BrawlWorld["fighters"][0]];
  // b tombe : plus de vie, il ne réapparaît pas, mais son équipe tient encore (c).
  b.hp = 1;
  b.pos = { x: a.pos.x + 1.2, y: 0, z: a.pos.z };
  a.facing = { x: 1, y: 0, z: 0 };
  a.target = b.id;
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.3);
  assert.equal(b.alive, false);
  assert.equal(b.stocks, 0);
  assert.equal(w.over, false, "l'équipe de b a encore c");
  run(w, w.config.respawnDelay + 0.5);
  assert.equal(b.alive, false, "éliminé : pas de retour");
  // c tombe aussi : l'équipe 0 gagne.
  c.hp = 1;
  c.pos = { x: a.pos.x + 1.2, y: 0, z: a.pos.z };
  a.target = c.id;
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.3);
  assert.equal(w.over, true);
  assert.equal(w.winner, 0);
});

test("multi : règle des K.-O. au temps, le plus de K.-O. gagne ; pas de coups entre équipiers", async () => {
  const { createMatch } = await import("../src/brawl/world.ts");
  const w = createMatch([{ kit: fighter(), team: 0 }, { kit: fighter(), team: 0 }, { kit: fighter(), team: 1 }], { ...BRAWL_CONFIG, rule: "kills", koToWin: 0, timeLimit: 5 });
  const [a, ally, foe] = w.fighters as [BrawlWorld["fighters"][0], BrawlWorld["fighters"][0], BrawlWorld["fighters"][0]];
  ally.pos = { x: a.pos.x + 1.1, y: 0, z: a.pos.z };
  foe.pos = { x: a.pos.x + 9, y: 0, z: a.pos.z + 9 };
  a.facing = { x: 1, y: 0, z: 0 };
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.3);
  assert.equal(ally.hp, ally.kit.stats.hp, "un équipier n'est pas touché");
  foe.hp = 1;
  foe.pos = { x: a.pos.x + 1.2, y: 0, z: a.pos.z };
  run(w, 0.5);
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.3);
  assert.equal(w.score[0], 1);
  run(w, 6);
  assert.equal(w.over, true);
  assert.equal(w.winner, 0, "au temps, l'équipe qui a le plus de K.-O.");
});

test("multi : les bots se répartissent les cibles au lieu de tous viser le même", async () => {
  const { createMatch } = await import("../src/brawl/world.ts");
  const { botCommand, createBot } = await import("../src/brawl/bot.ts");
  const { rng } = await import("../src/sim/math.ts");
  const w = createMatch([0, 1, 2, 3].map((team) => ({ kit: fighter(), team })));
  const r = rng(9);
  const bots = w.fighters.map(() => createBot(r));
  run(w, 3, () => w.fighters.map((f) => botCommand(w, f, bots[f.id]!)));
  const targets = w.fighters.map((f) => f.target).filter((t) => t !== null);
  assert.ok(new Set(targets).size >= 2, `cibles : ${targets.join(",")}`);
});

test("sortie de combo : une esquive pressée pendant l'étourdissement part à la première image libre", () => {
  const w = duel(fighter(), fighter());
  const b = w.fighters[1]!;
  b.energy = 30; // assez pour esquiver (15), pas pour le dégagement (50)
  step(w, [{ unit: 0, light: true }]);
  run(w, 0.15);
  assert.equal(b.action?.kind, "hitstun");
  // Une seule pression, tôt dans l'étourdissement.
  step(w, [{ unit: 0 }, { unit: 1, dodge: true }]);
  let ticks = 0;
  while (b.action?.kind === "hitstun" && ticks++ < 120) step(w, []);
  assert.equal(b.action?.kind, "dodge", "l'esquive mémorisée sort dès la fin de l'étourdissement");
});

test("sortie de combo : chaque coup reçu encore étourdi étourdit moins longtemps", () => {
  const kit: FighterKit = { ...fighter(), light: { hits: [strike, strike, strike] } };
  const w = duel(kit, fighter(), 1.2);
  const stuns: number[] = [];
  for (let i = 0; i < 120 && stuns.length < 3; i++) {
    const before = w.events.length;
    step(w, [{ unit: 0, light: true }]);
    for (const e of w.events.slice(before))
      if (e.type === "hit" && e.target === 1) {
        const a = w.fighters[1]!.action;
        stuns.push(a && "until" in a ? a.until - w.time - (w.fighters[1]!.hitlagUntil - w.time) : 0);
      }
  }
  assert.equal(stuns.length, 3);
  assert.ok(stuns[1]! < stuns[0]! - 1e-6 && stuns[2]! < stuns[1]! - 1e-6, `étourdissements ${stuns.map((s) => s.toFixed(3)).join(", ")}`);
  assert.ok(Math.abs(stuns[1]! / stuns[0]! - BRAWL_CONFIG.comboStunDecay) < 0.02);
});

test("influence directionnelle : tenir le stick en travers dévie l'éjection de 18° au plus", () => {
  const launch = (move?: { x: number; z: number }) => {
    const w = duel(fighter(), fighter(), 1.4);
    step(w, [{ unit: 0, heavy: true }]);
    for (let i = 0; i < 60; i++) {
      const b = w.fighters[1]!;
      // Le stick n'est tenu qu'une fois touché (sinon on sortirait de portée).
      step(w, [{ unit: 0 }, { unit: 1, ...(move && b.action ? { move } : {}) }]);
      if (b.action?.kind === "knockdown" && b.hitlagUntil <= w.time && !b.diPending) return Math.atan2(b.vel.z, b.vel.x);
    }
    throw new Error("pas d'éjection");
  };
  const straight = launch();
  const bent = launch({ x: 0, z: 1 });
  const along = launch({ x: 1, z: 0 });
  assert.ok(Math.abs(Math.abs(bent - straight) - BRAWL_CONFIG.diMaxAngle) < 0.02, `${((bent - straight) * 180) / Math.PI}°`);
  assert.ok(Math.abs(along - straight) < 1e-6, "dans l'axe de l'éjection : aucun effet");
});

test("récupération au sol : garde pressée juste avant l'atterrissage, on se relève aussitôt, invulnérable", () => {
  const fall = (tech: boolean) => {
    const w = duel(fighter(), fighter(), 1.4);
    step(w, [{ unit: 0, heavy: true }]);
    const b = w.fighters[1]!;
    let pressed = false;
    for (let i = 0; i < 120; i++) {
      // Presser une fois quand la chute touche presque le sol.
      const press = tech && !pressed && b.action?.kind === "knockdown" && b.vel.y < 0 && b.pos.y < 0.3;
      if (press) pressed = true;
      step(w, [{ unit: 0 }, { unit: 1, guard: press }]);
      if (b.action?.kind === "knockdown" && b.pos.y <= b.floor && b.vel.y === 0 && i > 5) return { w, b, landed: true };
      if (pressed && b.action?.kind !== "knockdown") return { w, b, landed: true };
    }
    return { w, b, landed: false };
  };
  const { w, b } = fall(true);
  assert.notEqual(b.action?.kind, "knockdown");
  assert.ok(b.invulnerableUntil > w.time, "invulnérable un instant");
  assert.ok(w.events.some((e) => e.type === "tech"));
  const plain = fall(false);
  assert.equal(plain.b.action?.kind, "knockdown", "sans appui : on reste au sol");
});
