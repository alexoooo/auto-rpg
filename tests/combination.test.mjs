/**
 * **The combination** (`src/core/skills/combination.ts`): one action, two straight drives: it
 * settles (here not at all: it stands quiet), drives the hand asked for, waits, drives the other
 * hand, and brings both back, holding both hands, the trunk and the legs until a hand is on its
 * way back, which it leaves to the guard, and the trunk and legs to the end; each drive pushes only
 * its own arm's channels, and a hand it has let go of it commands nothing of. The second waits for
 * the centre of mass to be over the feet, and is given up when it is not in time. Of one drive, it
 * holds only its hand, the trunk and the legs, and comes back after the one. A Warrior in its
 * guard with its feet planted (the stance holds a pose), settled a second and then pinned at the
 * lower trunk, punching a point ahead of its head: settled, its centre of mass is within a
 * centimetre of the middle of its feet, and the first drive carries it 10 cm ahead, where it
 * stays past the second's wait.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { bodyEffectors } from "../src/core/control/effectors.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { COMBINATION, combinationExecutor } from "../src/core/skills/combination.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: .05 };

/** A one-two of `settings` thrown with the right hand first, 2 s: the stages it went through, the arms each drive pushed, what it held at each stage, whether it commanded a hand it had let go of, and how it ended. */
async function oneTwo(settings) {
  const pose = { pitch: 0, seconds: .2 };
  const stand = await coreStand(humanSpec("workshop-fighter"), { posture: GUARD });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = combinationExecutor(body, ["one-two"], settings);
  const request = { id: 1, action: "one-two", effector: "hand.right", target: { kind: "point", at: [0, body.view.head.y, .6] } };
  try {
    const needs = executor.needs("one-two", "hand.right");
    const stages = [], arms = { first: new Set(), second: new Set() };
    let ending, strays = 0, commanded = 0, started = false;
    const holds = {}, rightArm = bodyEffectors(stand.built).find((e) => e.model.segment === "hand.right").model.channels;
    body.drive((view, dt) => {
      const result = started ? executor.update(view, [request], around, dt) : [];
      if (result[0]?.ending) ending = result[0].ending;
      if (result[0]?.stage && stages.at(-1) !== result[0].stage) stages.push(result[0].stage);
      if (result[0]?.stage) holds[result[0].stage] ??= result[0].holds;
      const command = executor.state.live ? executor.command(view, 1, around) : {};
      const stage = executor.state.live?.stage;
      const right = executor.state.live !== null && (rightArm.some((channel) => channel in command.posture) || !!command.handPoses?.right);
      if (executor.state.live && right) (holds[stage] ?? []).includes("hand.right") ? commanded++ : strays++;
      if (stage === "first" || stage === "second") for (const push of command.pushes) {
        const arm = /\.(left|right) /.exec(push.channel)?.[1];
        if (arm) arms[stage].add(arm);
      }
      return { posture: { ...GUARD, ...command.posture }, pushes: command.pushes ?? [], handPoses: command.handPoses,
        stance: { feet: ["left", "right"], centre: null, height: view.standing - .05, heading: 0, pose } };
    });
    stand.step(stand.seconds(1));
    stand.built.segments.get("lowerTrunk").body.setFixed(true);
    started = true;
    executor.start(body.view, request, around);
    stand.step(stand.seconds(2));
    return { needs, stages, arms: { first: [...arms.first], second: [...arms.second] }, holds, strays, commanded, rightArm, ending, live: executor.state.live };
  } finally { body.dispose(); stand.dispose(); }
}

test("a_combination_drives_the_hand_asked_for_then_the_other_and_brings_both_back", async () => {
  // Poised wherever its centre of mass is within a metre of its feet: always, here.
  const run = await oneTwo({ ...COMBINATION, poise: 1 });
  assert.deepEqual(run.needs, ["hand.left", "hand.right", "trunk", "legs"]);
  assert.deepEqual(run.stages, ["first", "between", "second", "return"], "standing quiet, with no settle, it drives at once");
  assert.deepEqual(run.arms, { first: ["right"], second: ["left"] }, "each drive pushes its own arm");
  assert.ok(run.rightArm.length > 0, "the right hand has its arm's channels");
  assert.deepEqual(run.holds, { first: ["hand.left", "hand.right", "trunk", "legs"], between: ["hand.left", "trunk", "legs"],
    second: ["hand.left", "trunk", "legs"], return: ["trunk", "legs"] });
  assert.ok(run.commanded > 0, "the right hand commanded while held");
  assert.equal(run.strays, 0, "nothing of the right hand once it is let go of");
  assert.deepEqual(run.ending, { kind: "completed" });
  assert.equal(run.live, null);
});

test("a_combination_gives_up_its_second_drive_while_its_centre_of_mass_is_off_its_feet", async () => {
  // Poised within 5 cm of the middle of its feet: settled it is within one, and the drive puts it 10 cm off until after the wait.
  const run = await oneTwo({ ...COMBINATION, poise: .05 });
  assert.deepEqual(run.stages, ["first", "between", "return"], "the second is never driven");
  assert.deepEqual(run.arms, { first: ["right"], second: [] });
  assert.deepEqual(run.ending, { kind: "completed" });
  assert.equal(run.live, null);
});

test("a_combination_of_one_drive_holds_only_its_hand_and_leaves_it_to_the_guard_coming_back", async () => {
  const run = await oneTwo({ ...COMBINATION, poise: 1, drives: 1 });
  assert.deepEqual(run.needs, ["hand.right", "trunk", "legs"]);
  assert.deepEqual(run.stages, ["first", "return"]);
  assert.deepEqual(run.arms, { first: ["right"], second: [] });
  assert.deepEqual(run.holds, { first: ["hand.right", "trunk", "legs"], return: ["trunk", "legs"] });
  assert.ok(run.commanded > 0, "the right hand commanded while held");
  assert.equal(run.strays, 0, "nothing of the right hand once it is let go of");
  assert.deepEqual(run.ending, { kind: "completed" });
});
