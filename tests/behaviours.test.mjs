import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { actionTactics } from "../src/core/mind/action-tactics.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { CLASSIC, FIGHTING } from "../src/core/mind/config.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { againstStanding, CHARGER, KICKS_ONLY, LEFT_HAND, RUNNER } from "./fixtures/behaving-bout.mjs";
import { withParts } from "./fixtures/minds.mjs";

test("ranked leg and action channels remain independent and empty behaviours stand in guard", () => {
  const spec = humanSpec("workshop-fighter"), body = { view: { time: 0, stance: { centre: new Vector3(), phase: "stand" }, senses: { side: "own", others: [], solids: [] } },
    report: { heading: .25, actions: [], ledger: [] }, envelope: { walk: { value: .4 }, ways: { forward: { value: .6 }, right: { value: .4 }, back: { value: .4 }, left: { value: .4 } }, turns: [], tried: null } };
  const orders = { move: { kind: "direct", direction: { x: 1, z: 0 } }, face: null };
  const tactics = actionTactics(spec, [], { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "close-in", metres: 0 }, { kind: "attack" }] }, () => orders);
  assert.deepEqual(tactics.decide(body, 1 / 120), { move: [.4, 0], face: Math.PI / 2, guard: { left: null, right: null }, actions: [] });
  assert.deepEqual(actionTactics(spec, [], { ...FIGHTING, list: [] }).decide(body, 1 / 120), { move: null, face: .25, guard: { left: null, right: null }, actions: [] });
});

test("the Runner opens the gap and the Charger closes it, neither striking nor falling", async () => {
  // How far each goes in its 4 s is measured apart (`tests/behaviours-capability.test.mjs`); here only the way.
  const ran = await againstStanding(RUNNER, 4), charged = await againstStanding(CHARGER, 4);
  assert.ok(ran.gap - ran.opened > .1, JSON.stringify(ran)); assert.ok(charged.opened - charged.gap > .1, JSON.stringify(charged));
  for (const read of [ran, charged]) assert.deepEqual([read.effectors, read.down], [[], false]);
});

test("a configured kick-only fighter commits no effector but its feet", async () => {
  const kicked = await againstStanding(KICKS_ONLY, 8, 1.2);
  assert.ok(kicked.effectors.every(effector => effector.startsWith("foot.")), JSON.stringify(kicked));
});

test("behaviour configuration validates continuous settings independently of action implementations", () => {
  assert.deepEqual([treeFaults(RUNNER), treeFaults(KICKS_ONLY), treeFaults(LEFT_HAND)], [[], [], []]);
  assert.ok(treeFaults(withParts(CLASSIC, { tactics: { list: [{ kind: "cover" }] } })).some(fault => fault.includes("guard")));
  assert.ok(treeFaults(withParts(CHARGER, { tactics: { list: [{ kind: "close-in", metres: -1 }] } })).some(fault => fault.includes("finite and nonnegative")));
});
