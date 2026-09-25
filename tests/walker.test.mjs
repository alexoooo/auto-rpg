// The walker, the middle rung of the naive ladder (skill ceiling session 03,
// `docs/plans/2026-09-25-skill-ceiling-03-drills-and-league.md`).
//
// What is held here:
// - **It walks in and swings on its clock.** Against a body that stands, it closes from the spawn to
//   its hold and starts a stroke once a period while in reach.
// - **It never guards.** No hand and no natural striker is ever asked to cover, beside a control
//   showing the same reader catching the duelist doing it.
// - **It swings what the body has.** Chosen by capability: a one-armed multileg swings its arm and a
//   handless wheeled rammer rams.
// - **It is the same mind on either side.** The same seed on the left and on the right of an idle
//   body swings at the same instants and closes along the same track, which is the cheap half of
//   the mirror check; the league's 128-bout mirror is the other half.
//
// Harness: the Node bout runner (`tests/harness/bout-runner.mjs`), one Havok instance for the file.
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { policyMind } from "../src/mind.ts";
import { WALKER, chooseStriker } from "../src/golem/walker.ts";

Logger.LogLevels = Logger.ErrorLogLevel;
const physics = await freshHavok();

const golem = (locomotion, torso, head, [pc, pt], [sc, st]) => ({ family: "golem", locomotion, torso, head,
  primary: { chain: pc, terminal: pt }, secondary: { chain: sc, terminal: st } });
/** Three legs and one arm, against a wheeled head-rammer with no hands (as in `tests/fork.test.mjs`). */
const ODD = {
  leftGolem: golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "blade"], ["none", "none"]),
  rightGolem: golem("locomotion.wheel", "torso.plain", "head.ram", ["none", "none"], ["none", "none"]),
};

/** A mind that records, every control step, what the mind inside it asked for. */
function recording(inner) {
  const log = [];
  let clock = 0;
  return {
    log,
    mind: {
      name: inner.name,
      decide(view, dt) {
        const intent = inner.decide(view, dt);
        clock += dt;
        log.push({
          t: clock,
          gap: Math.hypot(view.self.ground.x - view.opponent.ground.x, view.self.ground.z - view.opponent.ground.z),
          striker: chooseStriker(view),
          forward: intent.forward,
          acting: intent.actingHand,
          thrust: { primary: intent.primary.thrust, secondary: intent.secondary.thrust, natural: intent.natural.thrust },
          guard: intent.primary.guard || intent.secondary.guard || intent.natural.guard,
        });
        return intent;
      },
    },
  };
}

/** Run a bout of `seconds` with the subject on `side`, recorded, against a plain policy. */
function watch({ subject, side = "left", other = "idle", seconds, seed = 7, ...rest }) {
  const recorder = recording(policyMind(subject, seed));
  const bout = createBout({
    left: side === "left" ? subject : other, right: side === "left" ? other : subject,
    seeds: [seed, seed + 1], locomotionMode: "supported", maxSeconds: seconds, physics,
    ...(side === "left" ? { leftMind: recorder.mind } : { rightMind: recorder.mind }), ...rest,
  });
  while (bout.step()) { /* run to the cap */ }
  bout.dispose();
  return recorder.log;
}

/** The instants a striker's thrust goes up: one per stroke. */
function strokeStarts(log, striker) {
  const starts = [];
  for (let i = 1; i < log.length; i += 1) {
    if (log[i].thrust[striker] && !log[i - 1].thrust[striker]) starts.push(log[i].t);
  }
  return starts;
}

test("the_walker_walks_in_and_swings_on_its_clock", () => {
  const log = watch({ subject: "golem-walker", seconds: 9 });
  assert.ok(log[0].gap > 2.4, `it starts at the spawn (${log[0].gap.toFixed(2)} m)`);
  const closest = Math.min(...log.map((row) => row.gap));
  assert.ok(closest < 1.6, `it walks in (closest ${closest.toFixed(2)} m)`);
  assert.ok(log.every((row) => row.forward >= 0), "it never backs off");
  const starts = strokeStarts(log, "primary");
  assert.ok(starts.length >= 4, `it swings more than once (${starts.length})`);
  for (let i = 1; i < starts.length; i += 1) {
    const between = starts[i] - starts[i - 1];
    // A stroke begins once the period has run and never sooner; the chamber sits inside the period.
    assert.ok(between >= WALKER.period - 0.02 && between <= WALKER.period + 0.5,
      `stroke ${i} came ${between.toFixed(3)} s after the last`);
  }
});

test("the_walker_never_guards_and_the_reader_catches_a_mind_that_does", () => {
  const walker = watch({ subject: "golem-walker", other: "golem-duelist", seconds: 6 });
  assert.equal(walker.filter((row) => row.guard).length, 0, "the walker covered something");
  // The control: the same reader on the duelist, which guards as soon as it sees a threat.
  const duelist = watch({ subject: "golem-duelist", other: "golem-walker", seconds: 6 });
  assert.ok(duelist.filter((row) => row.guard).length > 0, "the reader cannot see a guard");
});

test("the_walker_swings_what_its_body_has", () => {
  const arm = watch({ subject: "golem-walker", side: "left", other: "golem-walker", seconds: 7, ...ODD });
  assert.deepEqual({ ...arm[0].striker, reach: undefined }, { hand: "primary", reach: undefined });
  assert.ok(strokeStarts(arm, "primary").length >= 2, "the one-armed body swings its arm");
  assert.ok(arm.every((row) => !row.thrust.natural && !row.thrust.secondary), "and nothing else");
  const ram = watch({ subject: "golem-walker", side: "right", other: "golem-walker", seconds: 7, ...ODD });
  assert.equal(ram[0].striker.hand, null, "a handless body's striker is its natural one");
  assert.ok(ram[0].striker.reach > 0);
  assert.ok(strokeStarts(ram, "natural").length >= 2, "the handless body rams");
  assert.ok(ram.every((row) => !row.thrust.primary && !row.thrust.secondary), "and never asks a hand");
});

test("the_walker_is_the_same_mind_on_either_side", () => {
  const left = watch({ subject: "golem-walker", side: "left", seconds: 6, seed: 91 });
  const right = watch({ subject: "golem-walker", side: "right", seconds: 6, seed: 91 });
  const a = strokeStarts(left, "primary");
  const b = strokeStarts(right, "primary");
  assert.ok(a.length >= 3, `it swings (${a.length})`);
  assert.equal(a.length, b.length, "the same number of strokes either side");
  for (let i = 0; i < a.length; i += 1) {
    assert.ok(Math.abs(a[i] - b[i]) <= 1 / 60, `stroke ${i} at ${a[i].toFixed(3)} and ${b[i].toFixed(3)}`);
  }
  let worst = 0;
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) worst = Math.max(worst, Math.abs(left[i].gap - right[i].gap));
  assert.ok(worst < 0.05, `it closes along the same track either side (worst ${worst.toFixed(3)} m apart)`);
});
