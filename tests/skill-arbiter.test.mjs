import test from "node:test";
import assert from "node:assert/strict";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { DEFAULT_ENGINE } from "../src/core/engine/engines.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { modelSpec } from "../src/core/models.ts";
import { skillSet } from "../src/core/skills/arbiter.ts";
import { pathParts, pathStrike } from "../src/core/skills/combat.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import { recipeParts } from "../src/core/skills/skills.ts";
import { closesToStrike } from "../src/core/skills/strikes.ts";
import { coreStand } from "./harness/core-stand.mjs";

const DT = 1 / 120;
const STANCE = Object.freeze({ feet: ["left", "right"], centre: null, height: 1, heading: 0.2 });
const PLACED = Object.freeze({ feet: ["left", "right"], centre: null, height: 1, heading: -0.4 });
const KICKED = Object.freeze({ feet: ["left"], centre: null, height: 1, heading: 0.2 });
const goal = (name) => Object.freeze({ places: [{ point: name, position: [0, 1, 0.5] }], seconds: 0.2 });
const COVER = Object.freeze({ left: goal("cover left"), right: goal("cover right") });
const THROWN = goal("thrown"), FOOT = goal("foot");
const BLOW = Object.freeze({ kind: "blow", hand: "right", target: [0, 1.6, 1], path: { family: "straight" } });
const KICK = Object.freeze({ kind: "kick", foot: "right", target: [0, 0.9, 1] });
const intent = (attack = null, more = {}) => ({ move: [0.5, 0], face: 0.3, guard: NO_COVER, attack, ...more });

/** A claim of the right hand, closed, with `legs` and `steer`. */
const claimOf = (legs = { kind: "free" }, steer = 0) => ({
  hands: { left: null, right: THROWN }, posture: null, pushes: [], closed: { left: false, right: true }, legs, steer,
});

/**
 * Parts that record what the arbiter asks of them: a blow that claims `claim`, a kick that is
 * under way with `foot` and gives `motion`, and a support skill at `stage`.
 */
function parts({ claim = null, holds = "right", busy = false, lower = null, releases = false, foot, motion = null, stage } = {}) {
  const calls = [];
  const legs = {
    state: {}, heading: 0.1, placed: true, pace: 0, reference: null,
    resume: () => calls.push(["resume", "legs"]),
    goal: (_, walk, face, __, lower) => { calls.push(["goal", walk, face, lower]); return STANCE; },
    place: (_, footing, lower) => { calls.push(["place", footing, lower]); return PLACED; },
  };
  const guard = { resume: () => calls.push(["resume", "guard"]), command: (_, __, taken) => { calls.push(["guard", taken]); return COVER; } };
  const blow = {
    state: {}, report: { hand: null, phase: null, blow: null, since: -Infinity, thrown: { left: 0, right: 0 }, still: 0 }, holds, busy, lower, releases,
    resume: () => calls.push(["resume", "blow"]),
    command: (_, attack, __, around) => { calls.push(["blow", attack, around.heading, around.placed, around.support?.stage ?? null]); return claim; },
  };
  const kick = foot === undefined ? null : {
    state: {}, report: { foot },
    resume: () => calls.push(["resume", "kick"]),
    command: (_, requested, stance, available) => { calls.push(["kick", requested, stance, available]); return motion; },
  };
  const support = stage === undefined ? null : {
    state: {}, report: { stage, ready: false },
    resume: () => calls.push(["resume", "support"]),
    tick: (_, lower, moving) => calls.push(["tick", lower, moving]),
    apply: (stance, posture) => stage === "stand" ? { stance, posture } : { stance: PLACED, posture: { ...posture, "lumbar flexion": 0.5 } },
  };
  return { calls, parts: { legs, guard, blow, kick, support } };
}

async function standing() {
  const s = await coreStand(modelSpec("workshop-fighter"), { engine: DEFAULT_ENGINE });
  const body = createBody(s.built, s.world, { servoSeconds: SERVO_SECONDS, feedback: true });
  const spec = s.built.spec, closes = { left: closesToStrike(spec, "left"), right: closesToStrike(spec, "right") };
  /** The hand poses a command gives with `fist` closed. */
  const poses = (fist) => closes.left || closes.right ? {
    ...(closes.left ? { left: fist === "left" ? "fist" : "open" } : {}), ...(closes.right ? { right: fist === "right" ? "fist" : "open" } : {}),
  } : undefined;
  return { ...s, body, poses, dispose: () => { body.dispose(); s.dispose(); } };
}

test("the blow's claim has the hands it names and the guard covers with the rest, in the order of steps", async () => {
  const s = await standing();
  try {
    const { calls, parts: made } = parts({ claim: claimOf() }), skills = skillSet(s.body, {}, made);
    const command = skills.command(s.body.view, intent(BLOW), DT);
    assert.deepEqual(calls, [["blow", BLOW, 0.1, true, null], ["guard", "right"], ["goal", [0.5, 0], 0.3, undefined]]);
    const poses = s.poses("right");
    assert.deepEqual(command, {
      posture: guardPosture(s.built.spec), pushes: [], effectors: { "hand.left": COVER.left, "hand.right": THROWN }, stance: STANCE,
      ...(poses ? { handPoses: poses } : {}),
    });
    assert.equal(skills.state.command, command);
    assert.deepEqual({ ...skills.report.holders }, { legs: "tactics", trunk: "guard", left: "guard", right: "blow" });
    // No claim: the guard has both hands, every hand open, and the tactics the legs.
    const idle = parts({ holds: null }), quiet = skillSet(s.body, {}, idle.parts).command(s.body.view, intent(), DT);
    assert.deepEqual(quiet.effectors, { "hand.left": COVER.left, "hand.right": COVER.right });
    assert.deepEqual(quiet.handPoses, s.poses(null));
    assert.deepEqual(idle.calls.map(([name]) => name), ["blow", "guard", "goal"]);
  } finally { s.dispose(); }
});

test("each ask of the legs reaches the legs, and a blow under way turns the heading", async () => {
  const s = await standing();
  try {
    const footing = { left: [0, 0], right: [0.3, 0] };
    const cases = [
      [{ kind: "free" }, ["goal", [0.5, 0], 0.3, undefined], STANCE, "tactics"],
      [{ kind: "hold" }, ["goal", null, 0.3, undefined], STANCE, "blow"],
      [{ kind: "walk", walk: [0.2, 0.1], face: -1 }, ["goal", [0.2, 0.1], -1, undefined], STANCE, "blow"],
      [{ kind: "place", footing }, ["place", footing, 0.1], PLACED, "blow"],
    ];
    for (const [legs, asked, stance, holder] of cases) {
      const { calls, parts: made } = parts({ claim: claimOf(legs, 0.25) }), skills = skillSet(s.body, {}, made);
      const command = skills.command(s.body.view, intent(BLOW, { lower: 0.1 }), DT);
      assert.deepEqual(calls.at(-1), legs.kind === "place" ? asked : [...asked.slice(0, 3), 0.1], legs.kind);
      assert.deepEqual(command.stance, { ...stance, heading: stance.heading + 0.25 }, legs.kind);
      assert.equal(skills.report.holders.legs, holder, legs.kind);
    }
  } finally { s.dispose(); }
});

test("a kick asked, or under way, leaves the blow none, holds the walk and lays its goals over the command", async () => {
  const s = await standing();
  try {
    const motion = { stance: KICKED, effectors: { "foot.right": FOOT } };
    for (const [attack, foot] of [[KICK, null], [BLOW, "right"]]) {
      const { calls, parts: made } = parts({ claim: claimOf(), foot, motion }), skills = skillSet(s.body, {}, made);
      const command = skills.command(s.body.view, intent(attack), DT);
      assert.deepEqual(calls.find(([name]) => name === "blow"), ["blow", null, 0.1, true, null]);
      assert.deepEqual(calls.find(([name]) => name === "goal"), ["goal", null, 0.3, undefined]);
      assert.deepEqual(calls.at(-1), ["kick", attack.kind === "kick" ? attack : null, STANCE, true]);
      assert.equal(command.stance, KICKED);
      assert.deepEqual(command.effectors, { "hand.left": COVER.left, "hand.right": THROWN, "foot.right": FOOT });
      assert.equal(skills.report.holders.legs, "kick");
    }
    // A blow under way: no kick may begin.
    const busy = parts({ claim: claimOf(), busy: true, foot: null, motion: null });
    skillSet(s.body, {}, busy.parts).command(s.body.view, intent(KICK), DT);
    assert.equal(busy.calls.at(-1)[3], false);
    // A set with no kick refuses one.
    assert.throws(() => skillSet(s.body, {}, parts().parts).command(s.body.view, intent(KICK), DT), /no kick/);
  } finally { s.dispose(); }
});

test("the support skill moves first, by the blow's stance, holds the walk while low and lays its stance and trunk", async () => {
  const s = await standing();
  try {
    const low = parts({ claim: claimOf(), lower: 0.4, stage: "low" }), skills = skillSet(s.body, {}, low.parts);
    const command = skills.command(s.body.view, intent(BLOW, { lower: 0.2 }), DT);
    assert.deepEqual(low.calls.slice(0, 3), [["tick", 0.4, true], ["blow", BLOW, 0.1, true, "low"], ["guard", "right"]]);
    assert.deepEqual(low.calls[3], ["goal", null, 0.3, STANCE_LOWER]);
    assert.equal(command.stance, PLACED);
    assert.equal(command.posture["lumbar flexion"], 0.5);
    assert.deepEqual({ ...skills.report.holders }, { legs: "support", trunk: "support", left: "guard", right: "blow" });
    // With no blow under way it moves by the tactics' stance, or the stance's own.
    for (const [lower, asked] of [[0.2, 0.2], [undefined, STANCE_LOWER]]) {
      const stand = parts({ stage: "stand" });
      skillSet(s.body, {}, stand.parts).command(s.body.view, intent(null, { lower, move: null }), DT);
      assert.deepEqual(stand.calls[0], ["tick", asked, false]);
      assert.deepEqual(stand.calls.at(-1), ["goal", null, 0.3, STANCE_LOWER]);
    }
  } finally { s.dispose(); }
});

test("every part is resumed, and a release resumes them only where the blow asks it", async () => {
  const s = await standing();
  try {
    for (const releases of [false, true]) {
      const { calls, parts: made } = parts({ releases, foot: null, stage: "stand" }), skills = skillSet(s.body, {}, made);
      assert.equal(typeof skills.release, releases ? "function" : "undefined");
      skills.resume(s.body.view);
      assert.deepEqual(calls.map(([, part]) => part).sort(), ["blow", "guard", "kick", "legs", "support"]);
    }
  } finally { s.dispose(); }
});

test("a blow skill of the role is swapped for another: the path strike thrown under the recipe set's legs and guard", async () => {
  const s = await standing();
  try {
    const skills = skillSet(s.body, {}, { ...recipeParts(s.body), blow: pathStrike(s.body) });
    const attack = { kind: "blow", hand: "right", target: [0.1, 1.63, 0.6], path: { family: "straight" } };
    s.body.drive((view, dt) => skills.command(view, intent(view.time >= 2 ? attack : null, { move: null }), dt));
    const seen = new Set();
    for (let i = 0; i < 6 * 120 && !(seen.has("swing") && skills.report.strike.phase === null); i++) {
      s.step();
      const { phase } = skills.report.strike, { holders } = skills.report;
      seen.add(phase);
      if (phase === "swing") assert.deepEqual({ ...holders }, { legs: "blow", trunk: holders.trunk, left: "guard", right: "blow" });
    }
    assert.deepEqual([...seen].map(String).sort(), ["chamber", "null", "return", "swing"]);
    assert.equal(skills.report.strike.thrown.right, 1);
    assert.deepEqual({ ...skills.report.holders }, { legs: "tactics", trunk: "guard", left: "guard", right: "guard" });
    assert.equal(s.body.view.down, false);
  } finally { s.dispose(); }
});

test("the path strike's usual parts are its settings: a kick and a support skill only where it has them", async () => {
  const s = await standing();
  try {
    const plain = pathParts(s.body), full = pathParts(s.body, { kick: undefined, ground: true });
    assert.deepEqual([plain.kick, plain.support], [null, null]);
    assert.equal(full.kick, null);
    assert.equal(typeof full.support.tick, "function");
    assert.deepEqual(Object.keys(skillSet(s.body, {}, full).state), ["command", "holders", "legs", "blow", "support", "tactics"]);
  } finally { s.dispose(); }
});
