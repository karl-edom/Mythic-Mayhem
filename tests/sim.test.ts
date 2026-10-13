import assert from "node:assert/strict";
import { test } from "node:test";
import { runMatch } from "../src/sim/match.ts";
import { applyEffect, step } from "../src/sim/world.ts";
import { duelWorld, testKit } from "./helpers.ts";

const far = 10; // out of basic attack range

test("l'armure réduit les dégâts et le bouclier absorbe en premier", () => {
  const w = duelWorld(testKit(), testKit({ stats: { hp: 1000, moveSpeed: 3.5, armor: 0.2, radius: 0.5 } }), far);
  const [a, b] = w.units;
  applyEffect(w, a!.id, b!, { type: "shield", amount: 30, duration: 2 }, a!.pos, 0);
  applyEffect(w, a!.id, b!, { type: "damage", amount: 100 }, a!.pos, 0);
  // 100 × (1 − 0.2) = 80, dont 30 absorbés
  assert.equal(b!.hp, 950);
  assert.equal(b!.shields.length, 0);
});

test("le soin ne dépasse pas les PV max", () => {
  const w = duelWorld(testKit(), testKit(), far);
  const b = w.units[1]!;
  b.hp = 990;
  applyEffect(w, b.id, b, { type: "heal", amount: 100 }, b.pos, 0);
  assert.equal(b.hp, 1000);
});

test("une zone en ligne ne frappe qu'à la fin de son délai, et seulement à l'intérieur", () => {
  const line = testKit({}, [
    { id: "ray", cooldown: 5, delivery: { type: "line", length: 8, width: 1, delay: 0.5 }, effects: [{ type: "damage", amount: 100 }] },
  ]);
  const w = duelWorld(line, testKit(), 6);
  const target = w.units[1]!;
  step(w, [{ unit: 0, cast: { slot: 0, target: target.pos } }]);
  for (let i = 0; i < 13; i++) step(w, []); // 0.47 s
  assert.equal(target.hp, 1000, "pas de dégâts avant la fin du télégraphe");
  for (let i = 0; i < 2; i++) step(w, []);
  assert.equal(target.hp, 900);

  const w2 = duelWorld(line, testKit(), 6);
  w2.units[1]!.pos.y += 2; // hors de la ligne (largeur 1 + rayon 0.5)
  step(w2, [{ unit: 0, cast: { slot: 0, target: { x: 16, y: 7 } } }]);
  for (let i = 0; i < 20; i++) step(w2, []);
  assert.equal(w2.units[1]!.hp, 1000);
});

test("un étourdissement empêche de bouger et d'attaquer", () => {
  const w = duelWorld(testKit(), testKit(), 1.5);
  const [a, b] = w.units;
  applyEffect(w, a!.id, b!, { type: "stun", duration: 1 }, a!.pos, 0);
  const before = { ...b!.pos };
  step(w, [{ unit: 1, move: { x: 1, y: 0 } }]);
  assert.deepEqual(b!.pos, before);
  assert.ok(!w.events.some((e) => e.type === "damage" && e.source === b!.id));
});

test("l'attaque de base ne part qu'à l'arrêt, puis immobilise brièvement", () => {
  const w = duelWorld(testKit(), testKit(), 1.5);
  step(w, [{ unit: 0, move: { x: -1, y: 0.01 } }, { unit: 1, move: { x: 1, y: 0 } }]);
  assert.equal(w.events.filter((e) => e.type === "damage").length, 0, "personne n'attaque en bougeant");

  const w2 = duelWorld(testKit(), testKit(), 1.5);
  step(w2, []);
  assert.equal(w2.events.filter((e) => e.type === "damage").length, 2);
  const a2 = w2.units[0]!;
  const before = { ...a2.pos };
  step(w2, [{ unit: 0, move: { x: -1, y: 0 } }]);
  assert.deepEqual(a2.pos, before, "immobilisé juste après son attaque");
});

test("le repoussement éloigne la cible sans la sortir de l'arène", () => {
  const w = duelWorld(testKit(), testKit(), 1);
  const [a, b] = w.units;
  b!.pos = { x: 23, y: 7 };
  a!.pos = { x: 22, y: 7 };
  applyEffect(w, a!.id, b!, { type: "knockback", distance: 3 }, a!.pos, 0);
  assert.equal(b!.pos.x, 24 - 0.5);
});

test("une partie est déterministe pour une graine donnée", () => {
  const ranged = testKit({ id: "r", basic: { range: 5, damage: 40, interval: 0.9, projectileSpeed: 16 } });
  const melee = testKit({ id: "m", stats: { hp: 1300, moveSpeed: 3.5, armor: 0.1, radius: 0.5 } });
  const r1 = runMatch([[ranged], [melee]], 42);
  const r2 = runMatch([[ranged], [melee]], 42);
  assert.equal(r1.winner, r2.winner);
  assert.equal(r1.duration, r2.duration);
  assert.deepEqual(r1.world.events, r2.world.events);
});
