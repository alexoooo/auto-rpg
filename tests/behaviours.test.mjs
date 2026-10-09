/**
 * The behaviours tactics: the merge, by rank, channel by channel; what each preset of behaviours
 * does to a Warrior that stands in guard (Node, core world, Rapier, 120 Hz, the Arena's room); and
 * the faults of behaviours whose skills disagree.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { behavioursTactics } from "../src/core/mind/behaviours.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { CHARGER, CLASSIC, KICKS_ONLY, LEFT_HAND, RUNNER } from "../src/core/mind/config.ts";
import { withParts } from "./fixtures/minds.mjs";

const STANDS = Object.freeze({ ...CLASSIC, tactics: { kind: "stand" }, blow: null });

test("the first behaviour that wants a channel has it, and what none wants stands in guard", () => {
  const cover = { threat: [0, 1.6, 1], guarded: [0, 1.6, 0] }, asked = [];
  const behaviour = (name, wants) => ({ want: (sight, dt, taken) => { asked.push([name, { ...taken }]); return wants; } });
  const tactics = behavioursTactics("test", [
    behaviour("passes", null),
    behaviour("walks", { legs: { move: [1, 0], face: 0.5 }, left: cover }),
    behaviour("strikes", { legs: { move: null, face: 2 }, attack: { kind: "blow", hand: "right", target: [0, 1.6, 1] } }),
    behaviour("covers", { left: null, right: cover }),
  ]);
  assert.deepEqual(tactics.decide({ report: { heading: 0.25 } }, 1 / 120), { move: [1, 0], face: 0.5,
    guard: { left: cover, right: cover }, attack: { kind: "blow", hand: "right", target: [0, 1.6, 1] } });
  assert.deepEqual(asked, [["passes", { legs: false, attack: false }], ["walks", { legs: false, attack: false }],
    ["strikes", { legs: true, attack: false }], ["covers", { legs: true, attack: true }]], "every behaviour is asked, told what is had");
  assert.deepEqual(behavioursTactics("test", []).decide({ report: { heading: 0.25 } }, 1 / 120),
    { move: null, face: 0.25, guard: { left: null, right: null }, attack: null });
});

/** `mind` against a Warrior standing in guard `gap` m away for `seconds`: the gap at the end, the blows each hand threw, and the kicks begun. */
async function against(mind, seconds, gap) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: mind, right: STANDS }, ...(gap ? { gap } : {}) });
  try {
    const { left, right } = duel.duelists, skills = left.minded.skills;
    let kicks = 0, kicking = false;
    while (world.time < seconds) {
      world.step();
      const now = skills.report.kick?.foot !== null && skills.report.kick?.foot !== undefined;
      if (now && !kicking) kicks++;
      kicking = now;
    }
    const a = left.body.view.stance.centre, b = right.body.view.stance.centre;
    return { gap: Math.hypot(a.x - b.x, a.z - b.z), thrown: { ...skills.report.strike.thrown }, kicks, down: left.body.view.down };
  } finally { dispose(); }
}

test("the Runner opens the gap and the Charger closes it, neither striking", async () => {
  const ran = await against(RUNNER, 4), charged = await against(CHARGER, 4);
  assert.ok(ran.gap > 5, `the Runner ends ${ran.gap.toFixed(2)} m away, from 4`);
  assert.ok(charged.gap < 3, `the Charger ends ${charged.gap.toFixed(2)} m away, from 4`);
  for (const read of [ran, charged]) assert.deepEqual([read.thrown, read.kicks, read.down], [{ left: 0, right: 0 }, 0, false]);
});

test("a fighter of the left hand alone strikes with it, and one of kicks alone kicks and never strikes", async () => {
  const jabbed = await against(LEFT_HAND, 8, 0.8), kicked = await against(KICKS_ONLY, 8, 1.2);
  assert.ok(jabbed.thrown.left >= 1 && jabbed.thrown.right === 0, `blows thrown ${JSON.stringify(jabbed.thrown)}`);
  assert.ok(kicked.kicks >= 1, `kicks begun: ${kicked.kicks}`);
  assert.deepEqual(kicked.thrown, { left: 0, right: 0 });
});

test("a behaviour carries its skill, and behaviours that name two blows or two kicks are faults", () => {
  assert.deepEqual([treeFaults(RUNNER), treeFaults(KICKS_ONLY), treeFaults(LEFT_HAND)], [[], [], []]);
  const strike = (blow) => ({ kind: "strike", hands: "alternate", aim: "head", blow });
  const kick = { kind: "kick", feet: "alternate", kick: { kind: "front-kick" } };
  const listed = (list) => ({ ...RUNNER, tactics: { kind: "behaviours", list } });
  assert.deepEqual(treeFaults(listed([strike({ kind: "recipe-strike" }), strike({ kind: "path-strike", overlap: true }), kick, kick])),
    ["tactics: a body has one blow, and these strikes name different ones"]);
  assert.deepEqual(treeFaults(listed([strike({ kind: "path-strike", overlap: false })])),
    ["tactics: a strike names no path, and the path strike carries out a blow only along one"]);
  assert.deepEqual(treeFaults(withParts(CHARGER, { tactics: { list: [{ kind: "close-in", metres: -1 }] } })), ["tactics.list.0: a distance must be finite and not negative"]);
});
