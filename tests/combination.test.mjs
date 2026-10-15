/**
 * **The combination** (`src/core/skills/combination.ts`): one action, two straight drives: it
 * settles (here not at all: it stands quiet), drives the hand asked for, waits, drives the other
 * hand, and brings both back, holding both hands, the trunk and the legs throughout; each drive
 * pushes only its own arm's channels. The second waits for the centre of mass to be over the feet,
 * and is given up when it is not in time. A Warrior pinned at the lower trunk, punching a point
 * ahead of its head: pinned, its stance steps under the first drive and its centre of mass stays
 * well off its feet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { COMBINATION, combinationExecutor } from "../src/core/skills/combination.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: .05 };

/** A one-two of `settings` thrown with the right hand first, 2 s: the stages it went through, the arms each drive pushed, what it held, and how it ended. */
async function oneTwo(settings) {
  const stand = await coreStand(humanSpec("workshop-fighter"), { posture: GUARD, pinned: "lowerTrunk" });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = combinationExecutor(body, ["one-two"], settings);
  const request = { id: 1, action: "one-two", effector: "hand.right", target: { kind: "point", at: [0, body.view.head.y, .6] } };
  try {
    const needs = executor.needs("one-two", "hand.right");
    executor.start(body.view, request, around);
    const stages = [], arms = { first: new Set(), second: new Set() };
    let ending, holds;
    body.drive((view, dt) => {
      const result = executor.update(view, [request], around, dt);
      if (result[0]?.ending) ending = result[0].ending;
      if (result[0]?.stage && stages.at(-1) !== result[0].stage) stages.push(result[0].stage);
      holds ??= result[0]?.holds;
      const command = executor.state.live ? executor.command(view, 1, around) : {};
      const stage = executor.state.live?.stage;
      if (stage === "first" || stage === "second") for (const push of command.pushes) {
        const arm = /\.(left|right) /.exec(push.channel)?.[1];
        if (arm) arms[stage].add(arm);
      }
      return { posture: { ...GUARD, ...command.posture }, pushes: command.pushes ?? [], handPoses: command.handPoses,
        stance: { feet: ["left", "right"], centre: null, height: view.standing - .05, heading: 0 } };
    });
    stand.step(stand.seconds(2));
    return { needs, stages, arms: { first: [...arms.first], second: [...arms.second] }, holds, ending, live: executor.state.live };
  } finally { body.dispose(); stand.dispose(); }
}

test("a_combination_drives_the_hand_asked_for_then_the_other_and_brings_both_back", async () => {
  // Poised wherever its centre of mass is within a metre of its feet: always, here.
  const run = await oneTwo({ ...COMBINATION, poise: 1 });
  assert.deepEqual(run.needs, ["hand.left", "hand.right", "trunk", "legs"]);
  assert.deepEqual(run.stages, ["first", "between", "second", "return"], "standing quiet, with no settle, it drives at once");
  assert.deepEqual(run.arms, { first: ["right"], second: ["left"] }, "each drive pushes its own arm");
  assert.deepEqual(run.holds, ["hand.left", "hand.right", "trunk", "legs"]);
  assert.deepEqual(run.ending, { kind: "completed" });
  assert.equal(run.live, null);
});

test("a_combination_gives_up_its_second_drive_while_its_centre_of_mass_is_off_its_feet", async () => {
  const run = await oneTwo(COMBINATION);
  assert.deepEqual(run.stages, ["first", "between", "return"], "the second is never driven");
  assert.deepEqual(run.arms, { first: ["right"], second: [] });
  assert.deepEqual(run.ending, { kind: "completed" });
  assert.equal(run.live, null);
});
