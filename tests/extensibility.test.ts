// Criterion 2 of E2: a new character is a data file, never an engine change.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { randomKit } from "../src/balance/generate.ts";
import { DATA_DIR, loadBalance, loadValidKits } from "../src/data/load.ts";
import { rng } from "../src/sim/math.ts";
import { runMatch } from "../src/sim/match.ts";

const balance = loadBalance();
const { costs } = balance;

test("un nouveau personnage s'ajoute en déposant un seul fichier de données", () => {
  const dir = mkdtempSync(join(tmpdir(), "kits-"));
  cpSync(join(DATA_DIR, "kits"), dir, { recursive: true });
  const before = loadValidKits(dir, balance).length;

  const r = rng(7);
  let kit;
  while (!kit) kit = randomKit(r, "nouveau", balance, (costs.budget.min + costs.budget.max) / 2);
  writeFileSync(join(dir, "nouveau.json"), JSON.stringify(kit));

  const kits = loadValidKits(dir, balance);
  assert.equal(kits.length, before + 1);
  const added = kits.find((k) => k.id === "nouveau")!;
  for (const other of kits) {
    const result = runMatch([[added], [other]], 1);
    assert.ok(result.duration > 0);
  }
});

test("le moteur ne connaît aucun personnage par son nom", () => {
  const ids = readdirSync(join(DATA_DIR, "kits")).map((f) => f.replace(/\.json$/, ""));
  const srcDir = new URL("../src/", import.meta.url).pathname;
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const code = readFileSync(join(srcDir, f), "utf8");
    for (const id of ids) assert.ok(!new RegExp(`["'\`]${id}["'\`]`).test(code), `src/${f} mentionne "${id}"`);
  }
});
