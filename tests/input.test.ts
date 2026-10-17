import assert from "node:assert/strict";
import { test } from "node:test";
import { Input, readPad } from "../src/client/input.ts";

/** A fake standard gamepad: pressed button indices and the left stick. */
const pad = (pressed: number[], x = 0, y = 0, index = 0) => ({
  connected: true,
  index,
  id: "fake",
  mapping: "standard",
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  axes: [x, y, 0, 0],
});

function withPads(list: unknown[]): Input {
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => list, configurable: true });
  const fakeWindow = { addEventListener: () => {} } as unknown as Window;
  return new Input(fakeWindow);
}

test("manette : zone morte du stick, puis une course progressive", () => {
  assert.deepEqual(readPad([], [0.1, -0.1]).stick, { x: 0, y: 0 });
  const half = readPad([], [0.59, 0]).stick.x;
  assert.ok(half > 0.4 && half < 0.6, `mi-course : ${half}`);
  assert.ok(Math.abs(readPad([], [1, 0]).stick.x - 1) < 1e-9);
});

test("manette : disposition à la Smash (A léger, X lourd, Y saut, RB bouclier, RT esquive, LB saisie)", () => {
  const held = readPad([0, 2, 3, 4, 5, 7].map((i) => i).reduce((b, i) => ((b[i] = true), b), [] as boolean[]), [0, 0]).held;
  for (const k of ["light", "heavy", "jump", "grab", "guard", "dodge"]) assert.ok(held.has(k as never), k);
});

test("manette : B seul donne la spéciale 1, B avec le stick incliné la 2, LT la 3", () => {
  const frames = [[pad([])], [pad([1])], [pad([])], [pad([1], 0.9, 0)], [pad([])], [pad([6])]];
  let i = 0;
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => frames[i]!, configurable: true });
  const input = withPads(frames[0]!);
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => frames[i]!, configurable: true });
  const specials: (number | undefined)[] = [];
  for (i = 0; i < frames.length; i++) {
    input.poll();
    specials.push(input.command(0, "pad0", { x: 0, z: -1 }).special);
  }
  assert.deepEqual(specials.filter((s) => s !== undefined), [0, 1, 2]);
});

test("manette : chaque manette pilote son propre combattant", () => {
  const input = withPads([pad([0]), pad([], 1, 0, 1)]);
  input.poll();
  const a = input.command(0, "pad0", { x: 0, z: -1 });
  const b = input.command(1, "pad1", { x: 0, z: -1 });
  assert.equal(a.light, true);
  assert.equal(b.light, false);
  assert.ok((b.move?.x ?? 0) > 0.9, "la 2e manette se déplace");
  assert.ok(Math.abs(a.move?.x ?? 0) < 1e-9, "la 1re ne bouge pas");
});
