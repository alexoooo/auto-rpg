import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBout } from "../research/bout.mjs";
import { actionTactics } from "../src/core/mind/action-tactics.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { CLASSIC, FIGHTING } from "../src/core/mind/config.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { behaving, withParts } from "./fixtures/minds.mjs";

const STANDS = { ...CLASSIC, tactics: { kind: "stand" }, actions: [], executors: [] };
const RUNNER = behaving([{ kind: "flee" }]), CHARGER = behaving([{ kind: "close-in", metres: .6 }]);
const ACTION_BEHAVIOURS = { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] };
const LEFT_HAND = { ...CLASSIC, tactics: ACTION_BEHAVIOURS, actions: CLASSIC.actions.map(action => ({ ...action, effectors: ["hand.left"] })) };
const KICKS_ONLY = { ...CLASSIC, tactics: ACTION_BEHAVIOURS, executors: [{ name: "kick", kind: "front-kick" }],
  actions: [{ name: "kick", executor: "kick", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "legs" }], aim: { kind: "leg-height", height: .4 } }] };

test("ranked leg and action channels remain independent and empty behaviours stand in guard", () => {
  const spec = humanSpec("workshop-fighter"), body = { view: { time: 0, stance: { centre: new Vector3(), phase: "stand" }, senses: { side: "own", others: [], solids: [] } },
    report: { heading: .25, actions: [], ledger: [] }, envelope: { walk: { value: .4 }, ways: { forward: { value: .6 } } } };
  const orders = { move: { x: 1, z: 0 }, face: null };
  const tactics = actionTactics(spec, [], { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "close-in", metres: 0 }, { kind: "attack" }] }, () => orders);
  assert.deepEqual(tactics.decide(body, 1 / 120), { move: [.4, 0], face: Math.PI / 2, guard: { left: null, right: null }, actions: [] });
  assert.deepEqual(actionTactics(spec, [], { ...FIGHTING, list: [] }).decide(body, 1 / 120), { move: null, face: .25, guard: { left: null, right: null }, actions: [] });
});

/** Observe whole protocol records through an actual Arena body, retaining counts beyond ledger eviction. */
async function against(mind, seconds, gap) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: mind, right: STANDS }, ...(gap ? { gap } : {}) });
  try {
    const { left, right } = duel.duelists, skills = left.minded.skills, begun = new Set(), effectors = [];
    while (world.time < seconds) {
      world.step();
      for (const instance of [...skills.report.actions, ...skills.report.ledger]) if (!begun.has(instance.id) && (instance.phase === "commit" || instance.committed)) { begun.add(instance.id); effectors.push(instance.effector); }
    }
    const a = left.body.view.stance.centre, b = right.body.view.stance.centre;
    return { gap: Math.hypot(a.x - b.x, a.z - b.z), effectors, down: left.body.view.down };
  } finally { dispose(); }
}

test("the Runner opens the gap and the Charger closes it, neither striking", async () => {
  const ran = await against(RUNNER, 4), charged = await against(CHARGER, 4);
  assert.ok(ran.gap > 5, JSON.stringify(ran)); assert.ok(charged.gap < 3, JSON.stringify(charged));
  for (const read of [ran, charged]) assert.deepEqual([read.effectors, read.down], [[], false]);
});

test("a configured left-hand fighter admits only its named effector", {
  todo: "the recipe jab's placed footing settles 7 to 8 cm short of its window, which is 6 cm either way, and it places again until its preparation deadline",
}, async () => {
  const jabbed = await against(LEFT_HAND, 8, .8);
  assert.ok(jabbed.effectors.length > 0, JSON.stringify(jabbed)); assert.ok(jabbed.effectors.every(effector => effector === "hand.left"));
});

test("a configured kick-only fighter admits only its named effectors", async () => {
  const kicked = await against(KICKS_ONLY, 8, 1.2);
  assert.ok(kicked.effectors.length > 0, JSON.stringify(kicked)); assert.ok(kicked.effectors.every(effector => effector.startsWith("foot.")));
});

test("behaviour configuration validates continuous settings independently of action implementations", () => {
  assert.deepEqual([treeFaults(RUNNER), treeFaults(KICKS_ONLY), treeFaults(LEFT_HAND)], [[], [], []]);
  assert.ok(treeFaults(withParts(CLASSIC, { tactics: { list: [{ kind: "cover" }] } })).some(fault => fault.includes("guard")));
  assert.ok(treeFaults(withParts(CHARGER, { tactics: { list: [{ kind: "close-in", metres: -1 }] } })).some(fault => fault.includes("finite and nonnegative")));
});
