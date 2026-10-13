import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { DATA_DIR, loadCosts, loadKitDir } from "../src/data/load.ts";
import { validateKit } from "../src/sim/validate.ts";

const costs = loadCosts();
const kits = loadKitDir(join(DATA_DIR, "kits"), costs);

/** A deep copy of a shipped kit, to mutate in tests. */
function kitJson(id: string): any {
  const k = kits.find((k) => k.file === `${id}.json`);
  assert.ok(k?.result.ok, `${id}.json devrait être valide`);
  return structuredClone(k.result.kit);
}

const errorsOf = (data: unknown) => {
  const r = validateKit(data, costs);
  return r.ok ? [] : r.errors;
};

test("tous les kits livrés sont valides et dans le budget", () => {
  for (const { file, result } of kits) assert.ok(result.ok, `${file} : ${result.ok ? "" : result.errors.join(" | ")}`);
});

test("un kit hors budget est refusé avec un message clair", () => {
  const k = kitJson("rempart");
  k.stats.hp = 2000;
  k.stats.armor = 0.4;
  assert.ok(errorsOf(k).some((e) => /budget: .* dépasse le maximum/.test(e)));
});

test("un kit trop faible est refusé", () => {
  const k = kitJson("rempart");
  k.stats.hp = 600;
  k.basic.damage = 1;
  assert.ok(errorsOf(k).some((e) => /sous le minimum/.test(e)));
});

test("un étourdissement doit toujours être esquivable", () => {
  const onDash = kitJson("lame");
  onDash.abilities[0].effects.push({ type: "stun", duration: 0.5 });
  assert.ok(errorsOf(onDash).some((e) => e.includes("étourdissement doit être esquivable")));

  const instant = kitJson("rempart");
  instant.abilities[1].delivery.delay = 0.1;
  assert.ok(errorsOf(instant).some((e) => e.includes("étourdissement doit être esquivable")));
});

test("un seul contrôle fort par kit", () => {
  const k = kitJson("rempart");
  k.abilities[0] = { id: "x", cooldown: 9, delivery: { type: "projectile", range: 6, speed: 14, width: 0.5 }, effects: [{ type: "stun", duration: 0.5 }] };
  assert.ok(errorsOf(k).some((e) => e.includes("un seul contrôle fort")));
});

test("les effets alliés exigent une zone ou une capacité sur soi", () => {
  const k = kitJson("etincelle");
  k.abilities[0].effects.push({ type: "heal", amount: 100 });
  assert.ok(errorsOf(k).some((e) => e.includes("effets alliés")));
});

test("les données malformées sont refusées sans planter", () => {
  assert.ok(errorsOf(null).length > 0);
  assert.ok(errorsOf({ schemaVersion: 2 }).some((e) => e.includes("schemaVersion")));
  const k = kitJson("seve");
  k.abilities[0].effects[0] = { type: "teleport_everyone", amount: 1 };
  assert.ok(errorsOf(k).some((e) => e.includes("effet inconnu")));
  const k2 = kitJson("seve");
  k2.stats.hp = "beaucoup";
  assert.ok(errorsOf(k2).some((e) => e.includes("kit.stats.hp")));
  const k3 = kitJson("seve");
  k3.abilities.push(k3.abilities[0]);
  assert.ok(errorsOf(k3).some((e) => e.includes("exactement 2 capacités")));
});
