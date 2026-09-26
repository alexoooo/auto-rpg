// The reference expert (skill ceiling session 04, `docs/plans/2026-09-25-skill-ceiling-04-expert.md`),
// on the odd morphology: a three-legged, one-armed body against a wheeled head-rammer with no hands.
//
// What is held here:
// - **A rollout is the future it predicts.** With the opponent's dice left alone, every decision's
//   predicted end state (both bars and every part's pose, hashed from its bytes) is the live world's
//   state at the next decision, in a bout and in a drill's rung world. It is the property the whole
//   search rests on: a plan scored in a fork is the plan the live body then plays. Beside it, the
//   control: with the persistence model in the opponent's place, the predictions do not all come
//   true, so the comparison can fail. (Restarting the duelist's dice is not a control: it draws
//   only on a few state changes, and over these seconds it drew nothing that changed a pose.)
// - **In a drill, the drill's judge scores the rollout in its fork.** Every candidate's task term
//   is survive-cut's pass less the rollout's own wound.
// - **An expert opponent is played forward from its own plan.** With an expert in each corner, a
//   rollout plays the other corner's committed plan and restored shadows; against an expert whose
//   plan carries no state, the predictions come true exactly as against the duelist.
// - **A reused fork is a fresh fork.** One kept fork world restored for every candidate chooses and
//   predicts exactly what a fresh exact fork per candidate does.
// - **A lagged expert plans on the world one decision old** (`-lag`, the blinded-fork mutation):
//   it does not search at its first decision, and each search after it is on the capture the
//   decision before took. Beside it, the control: unlagged, every search is on its own moment.
// - **Names parse to searches** and a bad name is refused rather than run as a default.
// - **The expert beats idle** on the odd pair: it empties the idle body's bar and loses none.
//
// Mutation checks, each run and each red: the shadows not restored into a rollout, a capture
// without Havok's heap (the teleport fork), a reused fork not restored, an expert opponent left to
// its fork slot's shell or played without its shadows, a drill task judging the live world, never
// framed or left off, the search keeping the worst plan, a lagged expert searching with no stale
// capture or on the live moment, and `-lag` parsed without its wait. Two
// edits survive and are equivalent here: not cloning a warm plan (the moment already holds a clone,
// and only one rollout of a fresh moment plays it) and the drill host's range feed (no drill reads
// it inside a rung; see `drillHost`).
//
// Harness: the Node bout runner, the fork harness and the drill runner; every world in a Havok
// instance of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { freshHavok } from "./harness/bout-runner.mjs";
import { runDrill } from "./harness/drills.mjs";
import {
  EXPERT_DEFAULTS, ExpertMind, expertConfig, poseHash, runExpertBout,
} from "./harness/expert.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

const golem = (locomotion, torso, head, [pc, pt], [sc, st]) => ({ family: "golem", locomotion, torso, head,
  primary: { chain: pc, terminal: pt }, secondary: { chain: sc, terminal: st } });
/** Three legs and one bladed arm (as in `tests/drills.test.mjs`). */
const TRI = golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "blade"], ["none", "none"]);
/** A wheeled head-rammer with no hands. */
const RAM = golem("locomotion.wheel", "torso.plain", "head.ram", ["none", "none"], ["none", "none"]);

/** A small, cheap search that keeps its predictions, over the opponent's actual dice unless told. */
const PLUMB = { ...EXPERT_DEFAULTS, candidates: 3, rounds: 1, horizon: 0.5, decisionHz: 2, reseed: false, trace: true };

/** An expert that also notes the live world's pose and bars each time a decision falls due. */
class Witnessed extends ExpertMind {
  constructor(config, seed) { super(config, seed); this.seen = []; }
  prepare(host) {
    const due = super.prepare(host);
    if (due) {
      const E = host.side, O = E === "left" ? "right" : "left";
      this.seen.push({ pose: poseHash(host.live), vE: host.live[E].vitality, vO: host.live[O].vitality });
    }
    return due;
  }
  /** Each decision's prediction against what the live world then held, one row a decision. */
  checks() {
    const rows = [];
    for (let k = 0; k + 1 < this.seen.length && k < this.log.length; k += 1) {
      const predicted = this.log[k].predicted, seen = this.seen[k + 1];
      rows.push({ pose: predicted.pose === seen.pose, bars: predicted.vE === seen.vE && predicted.vO === seen.vO });
    }
    return rows;
  }
}

const BASE = { left: "golem-duelist", right: "golem-duelist", seeds: [11, 22], locomotionMode: "supported",
  maxSeconds: 150, leftGolem: TRI, rightGolem: RAM, separation: 2.2 };

/**
 * A bout of `seconds` with a witnessed expert on the left, and `right` (an expert, or null for the
 * duelist) on the right.
 */
async function witnessBout(config, seconds, right = null) {
  const expert = new Witnessed(config, 5);
  const experts = right ? { left: expert, right } : { left: expert };
  const { experts: summaries } = await runExpertBout({ ...BASE, maxSeconds: seconds, physics: await freshHavok() }, { experts });
  return { checks: expert.checks(), log: expert.log, builds: summaries.left.builds };
}

test("a_rollout_is_the_future_it_predicts_in_a_bout", async () => {
  const { checks } = await witnessBout(PLUMB, 2.6);
  assert.ok(checks.length >= 4, `only ${checks.length} decisions were checked`);
  assert.deepEqual(checks, checks.map(() => ({ pose: true, bars: true })), "a predicted state did not come true");

  // The control: put the persistence model in the opponent's place and the predictions are of a
  // future the live world does not play, so the same comparison reports it.
  const control = await witnessBout({ ...PLUMB, opponent: "persistence" }, 2.6);
  assert.ok(control.checks.some((row) => !row.pose), "a modelled opponent still predicted every pose: the check cannot fail");
});

test("a_rollout_is_the_future_it_predicts_in_a_drill_rung", async () => {
  // The rammer as the subject of survive-cut, against the one-armed body cutting: the rung is one
  // second long, so the decisions come four times a second over a quarter-second horizon.
  let expert = null;
  const config = { ...PLUMB, decisionHz: 4, horizon: 0.25 };
  const run = await runDrill({ drill: "survive-cut", subjectSetup: RAM, opponentSetup: TRI, seed: 503,
    rungs: ["plumb"], rungFactory: (rung, seed) => (rung === "plumb" ? (expert = new Witnessed(config, seed)) : null) });
  assert.ok(run.rungs?.plumb, `the drill did not play the rung: ${JSON.stringify(run)}`);
  const checks = expert.checks();
  assert.ok(checks.length >= 3, `only ${checks.length} decisions were checked`);
  assert.deepEqual(checks, checks.map(() => ({ pose: true, bars: true })), "a predicted state did not come true");
  assert.equal(run.rungs.plumb.planner.decisions, expert.log.length, "the rung did not keep the planner's summary");

  // The drill's judge scored every rollout in its fork: survive-cut's task is its pass less the
  // wound, and the wound is the rollout's, from the bar at the decision to the rollout's end.
  const tasks = expert.log.flatMap((entry, k) => entry.candidates.map((candidate) => {
    const wound = expert.seen[k].vE - candidate.vE;
    return { task: candidate.task, judged: Number(wound < 0.03) - wound };
  }));
  assert.ok(tasks.some((row) => row.judged !== 1), "no rollout was wounded: the task's margin went unseen");
  assert.deepEqual(tasks.map((row) => row.task), tasks.map((row) => row.judged));
});

test("an_expert_opponent_is_played_forward_from_its_own_plan", async () => {
  // An expert with one candidate always commits the duelist's continuation, which carries no state
  // of its own, so the plan the other expert plays it forward from is what it then does.
  const follower = () => new ExpertMind({ ...EXPERT_DEFAULTS, candidates: 1, rounds: 1, horizon: 0.25, decisionHz: 2 }, 6);
  const { checks, log } = await witnessBout(PLUMB, 2.6, follower());
  assert.ok(checks.length >= 4, `only ${checks.length} decisions were checked`);
  assert.deepEqual(checks, checks.map(() => ({ pose: true, bars: true })), "a predicted state did not come true");
  assert.ok(log.some((entry) => entry.label !== "duelist"), "the witnessed expert only ever followed the duelist");
});

test("a_reused_fork_is_a_fresh_fork", async () => {
  const reused = await witnessBout(PLUMB, 2.1);
  const fresh = await witnessBout({ ...PLUMB, reuse: false }, 2.1);
  const strip = (log) => log.map(({ ms, cost, ...entry }) => entry);
  assert.deepEqual(strip(reused.log), strip(fresh.log));
  assert.ok(reused.builds < fresh.builds, `reuse built ${reused.builds} worlds and fresh ${fresh.builds}`);
});

test("a_lagged_expert_plans_on_the_world_one_decision_old", async () => {
  // The blinded-fork mutation (`-lag`): no search at the first decision, and every search after it
  // on the capture the decision before took.
  const lagged = await witnessBout({ ...PLUMB, stale: 1, lag: true }, 2.1);
  assert.ok(lagged.log.length >= 3, `only ${lagged.log.length} searches`);
  assert.ok(lagged.log[0].t > 0, "the first decision searched with no stale capture to search on");
  assert.deepEqual(lagged.log.map((entry) => entry.on), [0, ...lagged.log.slice(0, -1).map((entry) => entry.t)]);
  // The control: unlagged, every search is on its own moment.
  const live = await witnessBout(PLUMB, 1.1);
  assert.deepEqual(live.log.map((entry) => entry.on), live.log.map((entry) => entry.t));
});

test("a_forward_back_expert_never_strafes_and_still_predicts_its_future", async () => {
  // The footwork check's restricted expert (`-fb`, session 05): every command it applies has its
  // strafe zeroed, in the live bout and in its rollouts, so its predictions still come true.
  const strafes = async (config) => {
    const expert = new Witnessed(config, 5);
    const applied = [];
    await runExpertBout({ ...BASE, maxSeconds: 2.6, physics: await freshHavok() },
      { experts: { left: expert }, onFrame: (bout) => applied.push(bout.left.control.driver.held?.strafe ?? 0) });
    return { applied, checks: expert.checks() };
  };
  const fb = await strafes({ ...PLUMB, strafe: false });
  assert.ok(fb.checks.length >= 4, `only ${fb.checks.length} decisions were checked`);
  assert.deepEqual(fb.checks, fb.checks.map(() => ({ pose: true, bars: true })), "a predicted state did not come true");
  assert.deepEqual(fb.applied, fb.applied.map(() => 0), "the forward-back expert strafed");
  // The control: unrestricted, the same expert on the same bout does strafe.
  const free = await strafes(PLUMB);
  assert.ok(free.applied.some((s) => s !== 0), "the unrestricted expert never strafed: the check cannot fail");
});

test("an_expert_name_parses_to_its_search_and_a_bad_one_is_refused", () => {
  assert.equal(expertConfig("golem-duelist"), null);
  assert.deepEqual(expertConfig("expert"), { ...EXPERT_DEFAULTS, weights: { ...EXPERT_DEFAULTS.weights } });
  const named = expertConfig("expert-persist-blind-fresh-bout@c8,h0.5,r1,d2,s3");
  assert.deepEqual(
    { ...named, weights: undefined },
    { ...EXPERT_DEFAULTS, weights: undefined, opponent: "persistence", stale: 3, reuse: false, task: false,
      candidates: 8, horizon: 0.5, rounds: 1, decisionHz: 2 });
  assert.equal(expertConfig("expert-blind").stale, 4);
  assert.deepEqual([expertConfig("expert-lag").stale, expertConfig("expert-lag").lag], [1, true]);
  assert.equal(expertConfig("expert").lag, false);
  assert.deepEqual([expertConfig("expert-fb").strafe, expertConfig("expert").strafe], [false, true]);
  for (const bad of ["expert-psychic", "expert@c", "expert@x3", "expert@c0", "expert@h0"]) {
    assert.throws(() => expertConfig(bad), /expert:/, bad);
  }
});

test("the_expert_beats_idle_on_the_odd_pair", async () => {
  const config = { ...EXPERT_DEFAULTS, candidates: 4, rounds: 1, horizon: 0.75, decisionHz: 2 };
  const { vitality, result, experts: { left: expert } } = await runExpertBout(
    { ...BASE, right: "idle", maxSeconds: 8, physics: await freshHavok() },
    { experts: { left: new ExpertMind(config, 9) } });
  const [mine, theirs] = vitality;
  assert.equal(mine, 1, "the expert lost bar to an idle body");
  assert.equal(result.winner, "left", `the idle body kept ${theirs} of its bar through 8 s`);
  assert.ok(expert.decisions >= 4, `only ${expert.decisions} decisions`);
});
