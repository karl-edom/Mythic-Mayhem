import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPacks, parseLiteral } from "../tools/artifact.ts";

test("la page publiée rend ses packs sous forme de données", () => {
  const page = 'var a1={schemaVersion:3,id:`goku`,stats:{hp:760,weight:.75,radius:-1e-1},guard:!0,air:!1,cap:1/0,tags:["x",`y`],note:"a\\"b\\u00e9",nothing:null},b2={name:`Son Goku`,look:{model:`swordsman`}};' +
    'Object.assign({"/packs/local/goku/kit.json":a1});Object.assign({"/packs/local/goku/character.json":b2});';
  const packs = extractPacks(page);
  assert.deepEqual([...packs.keys()], ["goku/kit.json", "goku/character.json"]);
  assert.deepEqual(packs.get("goku/kit.json"), {
    schemaVersion: 3, id: "goku", stats: { hp: 760, weight: 0.75, radius: -0.1 }, guard: true, air: false, cap: Infinity, tags: ["x", "y"], note: 'a"bé', nothing: null,
  });
  assert.deepEqual(packs.get("goku/character.json"), { name: "Son Goku", look: { model: "swordsman" } });
});

test("un pack qui contiendrait du code est refusé, jamais exécuté", () => {
  assert.throws(() => parseLiteral("{a:alert(1)}", 0), /données/);
  assert.throws(() => parseLiteral("{a:`${alert(1)}`}", 0), /gabarit/);
});
