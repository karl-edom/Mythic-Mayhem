import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArena, pushOut, validateArena, type ArenaDef } from "../src/brawl/arena.ts";
import type { FighterKit } from "../src/brawl/kit.ts";
import { loadArenas, loadBrawlCosts, loadPropCatalog } from "../src/brawl/load.ts";
import { randomRoster } from "../src/brawl/generate.ts";
import { rng } from "../src/sim/math.ts";
import { runDuel } from "../src/brawl/match.ts";
import { FIGHTER_HEIGHT, canSee, createBrawl, step, type BrawlWorld, type Command } from "../src/brawl/world.ts";

const catalog = loadPropCatalog();
const strike = { damage: 50, startup: 0.1, active: 0.1, recovery: 0.2, reach: 1, size: 0.6, hitstun: 0.3, knockback: 2 };
const kit: FighterKit = {
  schemaVersion: 3,
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
  assert.ok(defs.length >= 3);
  assert.ok(defs.some((d) => d.id === "sanctuaire"), "l'arène japonaise est chargée");
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
  const costs = loadBrawlCosts();
  const kits = randomRoster(rng(11), 2, costs, costs.budget.target);
  for (const def of loadArenas(catalog)) {
    const r = runDuel(kits[0]!, kits[1]!, 3, undefined, undefined, buildArena(def, catalog));
    assert.equal(r.world.over, true, def.id);
  }
});

// Étape A2 : ramasser, lancer, projeter contre un mur.

test("on ramasse une caisse à portée ; elle ne bloque plus le passage", () => {
  const w = world([{ kind: "crate", x: -1.6, z: 0 }], -3, 10);
  step(w, [{ unit: 0, grab: true }]);
  assert.equal(w.fighters[0]!.action?.kind, "lift");
  run(w, w.config.liftTime + 0.05);
  assert.equal(w.fighters[0]!.carrying, 0);
  assert.equal(w.arena.props[0]!.alive, false);
});

test("on ne ramasse ni un rocher ni une caisse trop loin", () => {
  const rock = world([{ kind: "rock", x: -0.8, z: 0 }], -3, 10);
  step(rock, [{ unit: 0, grab: true }]);
  assert.equal(rock.fighters[0]!.action, null);
  const far = world([{ kind: "crate", x: 2, z: 0 }], -3, 10);
  step(far, [{ unit: 0, grab: true }]);
  assert.equal(far.fighters[0]!.action, null);
});

test("une caisse lancée inflige ses dégâts et se brise", () => {
  const w = world([{ kind: "crate", x: -4.6, z: 0 }], -6, 4);
  step(w, [{ unit: 0, grab: true }]);
  run(w, w.config.liftTime + 0.05);
  step(w, [{ unit: 0, grab: true }]);
  run(w, 1);
  assert.equal(w.fighters[1]!.hp, 1000 - catalog.crate!.throwable!.damage);
  assert.equal(w.projectiles.length, 0);
  assert.ok(w.events.some((e) => e.type === "propBroken" && e.prop === 0));
});

test("frappé pendant qu'il porte, on lâche (et casse) l'objet", () => {
  const w = world([{ kind: "crate", x: -4.6, z: 0 }], -6, -4.3);
  w.fighters[1]!.pos.x = 10; // loin pendant la levée
  step(w, [{ unit: 0, grab: true }]);
  run(w, w.config.liftTime + 0.05);
  w.fighters[1]!.pos.x = -4.6;
  step(w, [{ unit: 1, light: true }]);
  run(w, 0.3);
  assert.equal(w.fighters[0]!.carrying, null);
  assert.ok(w.fighters[0]!.hp < 1000);
  assert.ok(w.events.some((e) => e.type === "propBroken"));
});

test("projeté contre un rocher, on prend des dégâts en plus", () => {
  const heavy = (props: ArenaDef["props"]) => {
    const w = world(props, -2, -0.5);
    step(w, [{ unit: 0, heavy: true }]); // relâché aussitôt : pas de charge
    run(w, 0.8);
    return w;
  };
  const open = heavy([]);
  assert.equal(open.fighters[1]!.hp, 900);
  const wall = heavy([{ kind: "rock", x: 2, z: 0 }]);
  assert.ok(wall.fighters[1]!.hp < 900 - 30, `PV : ${wall.fighters[1]!.hp}`);
  assert.ok(wall.events.some((e) => e.type === "slam"));
});

// Étape A4 : la hauteur.

/** A 6×6 platform 3 m high centred on x = 0, with a ramp on its east side rising westwards. */
const tower: ArenaDef["props"] = [
  { kind: "platform", x: 0, z: 0 },
  { kind: "ramp", x: 6, z: 0, dir: "-x" },
];

test("on monte une rampe en marchant jusqu'au sommet d'une plateforme", () => {
  const w = world(tower, 10, -15);
  run(w, 1.7, () => [{ unit: 0, move: { x: -1, z: 0 } }]);
  const a = w.fighters[0]!;
  assert.ok(a.pos.x < 2.5, `x = ${a.pos.x}`);
  assert.ok(Math.abs(a.pos.y - 3) < 1e-6, `y = ${a.pos.y}`);
});

test("une plateforme haute bloque le passage au sol ; on tombe de son bord", () => {
  const w = world([{ kind: "platform", x: 0, z: 0 }], -6, 15);
  run(w, 2, () => [{ unit: 0, move: { x: 1, z: 0 } }]);
  assert.ok(w.fighters[0]!.pos.x <= -3.5 + 1e-6);
  const top = world(tower, 10, -15);
  run(top, 1.7, () => [{ unit: 0, move: { x: -1, z: 0 } }]); // en haut
  run(top, 1.5, () => [{ unit: 0, move: { x: 0, z: 1 } }]); // vers le bord nord
  assert.equal(top.fighters[0]!.pos.y, 0);
});

test("d'en haut, on voit par-dessus un muret qui cache au sol", () => {
  const props: ArenaDef["props"] = [...tower, { kind: "wall", x: -6, z: 8, rotated: true }];
  const w = world(props, -9, 8);
  const [a, b] = w.fighters;
  a!.pos = { x: -9, y: 0, z: 8 };
  b!.pos = { x: -3, y: 0, z: 8 };
  assert.equal(canSee(w, a!, b!), false, "au sol, le muret cache");
  b!.pos = { x: 0, y: 3, z: 0 };
  b!.floor = 3;
  a!.pos = { x: -12, y: 0, z: 8 };
  assert.equal(canSee(w, a!, b!), true, "le perché au-dessus du muret est visible");
});

test("un projectile vise un adversaire perché ; une zone au sol ne l'atteint pas", () => {
  const w = world(tower, -8, 10);
  const b = w.fighters[1]!;
  b.pos = { x: 0, y: 3, z: 0 };
  b.floor = 3;
  w.fighters[0]!.pos = { x: -14, y: 0, z: 0 }; // assez loin pour que le tir passe au-dessus du bord
  step(w, [{ unit: 0, special: 0 }]);
  run(w, 1.5);
  assert.equal(b.hp, 900, "le tir atteint le haut de la plateforme");
  // Une zone posée au sol, au pied de la plateforme, ne touche pas celui qui est perché.
  const z = world(tower, -8, 10);
  const perched = z.fighters[1]!;
  perched.pos = { x: -2.6, y: 3, z: 0 };
  perched.floor = 3;
  z.zones.push({ owner: 0, team: 0, slot: 0, center: { x: -3.5, y: 0, z: 0 }, radius: 2, createdAt: 0, triggerAt: z.time + 0.05 });
  run(z, 0.2);
  assert.equal(perched.hp, 1000);
});

test("le bot rejoint par la rampe un adversaire perché sur une plateforme", async () => {
  const { botCommand, createBot } = await import("../src/brawl/bot.ts");
  const { rng } = await import("../src/sim/math.ts");
  const w = world(tower, -12, 0);
  // This test is about climbing: the tower must not be shot down meanwhile (everything breaks now).
  for (const p of w.arena.props) p.hp = Infinity;
  const target = w.fighters[1]!;
  target.pos = { x: -1, y: 3, z: 1 };
  target.floor = 3;
  const bot = createBot(rng(3));
  let reached = false;
  for (let i = 0; i < 30 * w.config.tickRate && !reached; i++) {
    step(w, [botCommand(w, w.fighters[0]!, bot)]);
    reached = w.fighters[0]!.pos.y >= 3 - 1e-6;
  }
  assert.ok(reached, `le bot reste en bas (x = ${w.fighters[0]!.pos.x.toFixed(1)}, z = ${w.fighters[0]!.pos.z.toFixed(1)})`);
});

test("tout est cassable : chaque élément du catalogue a des points de vie", () => {
  for (const [id, k] of Object.entries(catalog)) assert.ok(typeof k.hp === "number" && k.hp > 0, `${id} : hp ${k.hp}`);
});

test("une plateforme détruite fait tomber ceux qui sont dessus", () => {
  const w = world([{ kind: "platform", x: 0, z: 0 }], -10, 10);
  const f = w.fighters[0]!;
  f.pos = { x: 0, y: 3, z: 0 };
  f.floor = 3;
  run(w, 0.2);
  assert.equal(f.pos.y, 3);
  w.arena.props[0]!.alive = false;
  run(w, 1.5);
  assert.equal(f.pos.y, 0);
});

// Décision 0024 : volumes surélevés (planchers, toits), dimensions par placement, décor.

test("un plancher surélevé : on passe dessous, on retombe dessus, on y tient debout", () => {
  const floor = { kind: "platform", x: 0, z: 0, y: 2.2, w: 4, d: 4, h: 0.3 };
  // Dessous : on traverse de part en part.
  const w = world([floor], -4, 12);
  run(w, 1.6, () => [{ unit: 0, move: { x: 1, z: 0 } }]);
  assert.ok(w.fighters[0]!.pos.x > 2.5, `passé dessous (x = ${w.fighters[0]!.pos.x.toFixed(2)})`);
  assert.equal(w.fighters[0]!.pos.y, 0);
  // Dessus : on y retombe et on y reste.
  const w2 = world([floor], -4, 12);
  w2.fighters[0]!.pos = { x: 0, y: 4, z: 0 };
  run(w2, 1);
  assert.ok(Math.abs(w2.fighters[0]!.pos.y - 2.5) < 1e-6, `debout sur le plancher (y = ${w2.fighters[0]!.pos.y})`);
});

test("dimensions par placement : un mur long et fin bloque, sa porte laisse passer", () => {
  const wall = (z: number, d: number) => ({ kind: "wall", x: 0, z, w: 0.3, d, h: 3 });
  const w = world([wall(-8, 14), wall(8, 14)], -3, 12);
  w.fighters[0]!.pos.z = -5;
  run(w, 1.2, () => [{ unit: 0, move: { x: 1, z: 0 } }]);
  assert.ok(w.fighters[0]!.pos.x < 0, "le mur arrête");
  // La porte (z entre -1 et 1) : on passe.
  const w2 = world([wall(-8, 14), wall(8, 14)], -3, 12);
  w2.fighters[0]!.pos.z = 0;
  run(w2, 1.2, () => [{ unit: 0, move: { x: 1, z: 0 } }]);
  assert.ok(w2.fighters[0]!.pos.x > 1.5, "la porte laisse passer");
});

test("la vue passe sous un toit, pas à travers un mur", () => {
  const roof = { kind: "platform", x: 0, z: 0, y: 2.6, w: 4, d: 4, h: 0.4 };
  const w = world([roof]);
  assert.ok(canSee(w, w.fighters[0]!, w.fighters[1]!), "sous le toit, on se voit");
  const w2 = world([{ kind: "wall", x: 0, z: 0, w: 0.3, d: 20, h: 3 }]);
  w2.fighters[0]!.pos.x = -10;
  w2.fighters[1]!.pos.x = 10;
  assert.equal(canSee(w2, w2.fighters[0]!, w2.fighters[1]!), false);
});

test("navigation : le chemin contourne un mur par sa porte", async () => {
  const { findPath } = await import("../src/brawl/nav.ts");
  const a = buildArena(arena([{ kind: "wall", x: 0, z: -8, w: 0.3, d: 14, h: 3 }, { kind: "wall", x: 0, z: 8, w: 0.3, d: 14, h: 3 }]), catalog);
  const path = findPath(a, { x: -4, z: -6 }, { x: 4, z: -6 });
  assert.ok(path && path.length >= 2, "un chemin existe");
  assert.ok(path!.some((p) => Math.abs(p.x) < 1 && Math.abs(p.z) < 1.2), "il passe par la porte");
  const shut = buildArena(arena([{ kind: "wall", x: 0, z: 0, w: 0.3, d: 30, h: 3 }]), catalog);
  assert.equal(findPath(shut, { x: -4, z: 0 }, { x: 4, z: 0 }), null);
});

test("le validateur lit hauteurs, dimensions et décor, et refuse les valeurs hors bornes", () => {
  const ok = validateArena({ ...arena([{ kind: "platform", x: 0, z: 0, y: 2, w: 3, d: 2, h: 0.3 }]), decor: [{ look: "lantern-hang", x: 1, z: 2, y: 3, yaw: 1 }], floor: "village" }, catalog);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.def.props[0], { kind: "platform", x: 0, z: 0, rotated: false, y: 2, w: 3, d: 2, h: 0.3 });
    assert.equal(ok.def.decor?.length, 1);
    assert.equal(ok.def.floor, "village");
  }
  assert.equal(validateArena(arena([{ kind: "platform", x: 0, z: 0, y: -1 }]), catalog).ok, false);
  assert.equal(validateArena({ ...arena([]), decor: [{ look: "<script>", x: 0, z: 0 }] }, catalog).ok, false);
});

test("on ne traverse pas un plancher en sautant dessous : la tête bute", () => {
  const floor = { kind: "platform", x: 0, z: 0, y: 2.2, w: 4, d: 4, h: 0.3 };
  for (const v of [6, 8, 11, 14]) {
    const w = world([floor], 0, 12);
    const f = w.fighters[0]!;
    f.vel.y = v;
    let head = 0;
    for (let i = 0; i < 120; i++) {
      step(w, []);
      head = Math.max(head, f.pos.y + FIGHTER_HEIGHT);
    }
    assert.ok(head <= 2.2 + 1e-6, `élan ${v} : la tête monte à ${head.toFixed(2)} m, au-dessus du plancher (2,2 m)`);
    assert.equal(f.pos.y, 0, `élan ${v} : retombé au sol, pas sur le plancher`);
  }
});

test("on ne se pose pas sur un mur coiffé d'un autre mur : il bloque à toute hauteur de saut", () => {
  // Le mur du rez-de-chaussée (2,6 m) et celui de l'étage (à partir de 2,85 m), comme au village.
  const low = { kind: "wall", x: 0, z: 0, w: 0.3, d: 6, h: 2.6 };
  const high = { kind: "wall", x: 0, z: 0, y: 2.85, w: 0.3, d: 6, h: 2.5 };
  for (const v of [5, 7, 8, 9, 10]) {
    const w = world([low, high], -1.2, 12);
    const f = w.fighters[0]!;
    f.vel.y = v;
    run(w, 1.5, () => [{ unit: 0, move: { x: 1, z: 0 } }]);
    assert.ok(f.pos.x < 0, `élan ${v} : passé de l'autre côté du mur (x = ${f.pos.x.toFixed(2)}, y = ${f.pos.y.toFixed(2)})`);
  }
});

test("éjecté à pleine vitesse contre un mur fin, on reste du bon côté", () => {
  const thin = { kind: "wall", x: 0, z: 0, w: 0.2, d: 8, h: 3 };
  for (const speed of [15, 22, 30, 40]) {
    const w = world([thin], -1, 12);
    const f = w.fighters[0]!;
    f.vel = { x: speed, y: 1, z: 0 };
    f.action = { kind: "knockdown", until: w.time + 2 } as never;
    run(w, 0.5);
    assert.ok(f.pos.x < 0, `à ${speed} m/s : passé à travers le mur (x = ${f.pos.x.toFixed(2)})`);
  }
});

test("enfoncé dans un volume épais, on en sort par le côté d'où l'on vient", () => {
  const thick = buildArena(arena([{ kind: "platform", x: 0, z: 0, w: 4, d: 1.4, h: 1 }]), catalog).props[0]!;
  // Entré par le côté z > 0, le centre a déjà dépassé le milieu du volume.
  const pos = { x: 0, z: -0.3 };
  pushOut(thick, pos, 0.4, { x: 0, z: 0.9 });
  assert.ok(pos.z > 0.7, `ressorti côté entrée (z = ${pos.z.toFixed(2)})`);
});
